const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { createPlexClient } = require('../lib/plexClient');

const SEGMENT_NAME_REGEX = /^segment_(\d{5})\.ts$/i;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hardcoded configuration
const SEGMENT_DURATION = 4;
const MIN_SEGMENTS_BEFORE_READY = 10;
const MAX_PLAYLIST_SEGMENTS = 20;
const SEGMENT_WAIT_TIMEOUT_MS = 15_000;
const SEGMENT_POLL_INTERVAL_MS = 500;
const SEGMENT_READ_TIMEOUT_MS = 10_000;
const SEGMENT_READ_POLL_MS = 200;
const DEFAULT_DURATION_SECONDS = 600;

class VodService {
  constructor({ env, logger }) {
    if (!env) throw new Error('env is required for VodService');
    if (!logger) throw new Error('logger is required for VodService');

    this.env = env;
    this.logger = logger.child({ module: 'VodService' });
    this.plexClient = createPlexClient({ env, logger: this.logger });

    // State
    this.vodBuilds = new Map();
    this.completedBuilds = new Set();
    this.processes = new Map();

    fs.mkdirSync(env.streamCacheDir, { recursive: true });
  }

  cacheDirFor(plexId) {
    return path.resolve(this.env.streamCacheDir, String(plexId));
  }

  playlistPathFor(plexId) {
    return path.join(this.cacheDirFor(plexId), 'index.m3u8');
  }

  segmentPatternFor(plexId) {
    return path.join(this.cacheDirFor(plexId), 'segment_%05d.ts');
  }

  async listSegments(plexId) {
    const dir = this.cacheDirFor(plexId);
    try {
      const entries = await fsp.readdir(dir);
      return entries
        .filter((name) => SEGMENT_NAME_REGEX.test(name))
        .sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async getPlaylist(plexId) {
    this.triggerVodBuild(plexId);

    const start = Date.now();
    let readySegments = [];
    while (Date.now() - start < SEGMENT_WAIT_TIMEOUT_MS) {
      const segments = await this.listSegments(plexId);
      if (segments.length >= MIN_SEGMENTS_BEFORE_READY) {
        readySegments = segments.slice(-MAX_PLAYLIST_SEGMENTS);
        break;
      }
      if (segments.length > 0 && Date.now() - start > SEGMENT_POLL_INTERVAL_MS * 3) {
        readySegments = segments.slice(-MAX_PLAYLIST_SEGMENTS);
        break;
      }
      await delay(SEGMENT_POLL_INTERVAL_MS);
    }

    if (!readySegments.length) {
      // One last check
      const segments = await this.listSegments(plexId);
      readySegments = segments.slice(-MAX_PLAYLIST_SEGMENTS);
    }

    if (!readySegments.length) {
      const error = new Error('Segments not ready yet');
      error.statusCode = 503;
      throw error;
    }

    const metadata = await this.plexClient.getMetadata(plexId);
    
    const rawMs = metadata?.Duration ?? metadata?.duration ??
      metadata?.Media?.[0]?.Duration ?? metadata?.Media?.[0]?.duration ??
      metadata?.Media?.[0]?.Part?.[0]?.Duration ?? metadata?.Media?.[0]?.Part?.[0]?.duration;
    const totalSeconds = Number.isFinite(Number(rawMs)) ? Number(rawMs) / 1000 : DEFAULT_DURATION_SECONDS;

    const targetDuration = Math.ceil(SEGMENT_DURATION);
    const segmentCount = Math.max(1, Math.ceil(totalSeconds / SEGMENT_DURATION));
    const basePath = `/stream/movies/${plexId}/`;
    
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
    ];

    for (let i = 0; i < segmentCount; i++) {
      const isLast = i === segmentCount - 1;
      const remaining = totalSeconds - SEGMENT_DURATION * i;
      const duration = isLast ? Math.max(remaining, 0.1) : SEGMENT_DURATION;
      const segmentName = `segment_${String(i).padStart(5, '0')}.ts`;
      lines.push(`#EXTINF:${duration.toFixed(3)},`, `${basePath}${segmentName}`);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  }

  async streamSegment({ plexId, segmentName, res }) {
    if (!SEGMENT_NAME_REGEX.test(segmentName)) {
      const error = new Error('Invalid segment name');
      error.statusCode = 400;
      throw error;
    }

    this.triggerVodBuild(plexId);

    const dir = this.cacheDirFor(plexId);
    const resolved = path.resolve(dir, segmentName);
    const safePrefix = `${dir}${path.sep}`;
    const segmentPath = resolved.startsWith(safePrefix) ? resolved : null;

    if (!segmentPath) {
      const error = new Error('Invalid segment path');
      error.statusCode = 400;
      throw error;
    }

    const start = Date.now();
    let found = false;
    while (Date.now() - start < SEGMENT_READ_TIMEOUT_MS) {
      try {
        await fsp.access(segmentPath, fs.constants.R_OK);
        found = true;
        break;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      await delay(SEGMENT_READ_POLL_MS);
    }
    if (!found) throw new Error('Segment not ready');

    res.status(200);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('video/mp2t');

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(segmentPath);
      const cleanup = () => stream.destroy();
      stream.once('error', (err) => { cleanup(); reject(err); });
      res.once('close', () => { cleanup(); resolve(); });
      stream.once('end', () => { cleanup(); resolve(); });
      stream.pipe(res);
    });
  }

  triggerVodBuild(plexId) {
    if (this.completedBuilds.has(plexId) || this.vodBuilds.has(plexId)) return;

    const job = (async () => {
      const playlistPath = this.playlistPathFor(plexId);
      
      try {
        await fsp.access(playlistPath);
        return; // Already exists
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      const plexDir = this.cacheDirFor(plexId);
      await fsp.rm(plexDir, { recursive: true, force: true });
      await fsp.mkdir(plexDir, { recursive: true });

      const sourceUrl = await this.plexClient.getPrimaryPartStreamUrl(plexId);

      const args = [
        '-hide_banner', '-y', '-loglevel', this.env.ffmpegLogLevel || 'error',
        '-i', sourceUrl,
        '-max_delay', '50000',
        '-probesize', '20000000',
        '-analyzeduration', '20000000',
        '-map', '0:v:0',
        '-map', '0:a:0?',
      ];

      if (this.env.videoCodec) {
        args.push('-c:v', this.env.videoCodec);
        if (this.env.videoCodec !== 'copy') {
          // Remove profile as it can conflict with level
          // args.push('-profile:v', 'high'); 

          // Prioritize CRF if available, otherwise use bitrate
          if (this.env.ffmpegCrf) {
            args.push('-crf', String(this.env.ffmpegCrf));
          } else if (this.env.videoBitrate) {
            args.push('-b:v', this.env.videoBitrate);
          }

          if (this.env.ffmpegPreset) args.push('-preset', this.env.ffmpegPreset);
        }
      }

      // Remove level as it can conflict with profile or input stream params
      // args.push('-level:v', '4.1');
      args.push('-r', '30', '-g', '120', '-keyint_min', '120');

      if (this.env.audioCodec) {
        args.push('-c:a', 'aac');
        if (this.env.audioCodec !== 'copy' && this.env.audioBitrate) {
          args.push('-b:a', this.env.audioBitrate);
        }
      }

      args.push('-ac', '2', '-ar', '48000');

      // Normalize path for ffmpeg running in container (Linux)
      const normalize = (p) => p.split(path.sep).join('/');
      const segmentPattern = normalize(this.segmentPatternFor(plexId));
      const playlistPathNormalized = normalize(this.playlistPathFor(plexId));

      args.push(
        '-f', 'hls',
        '-hls_time', String(SEGMENT_DURATION),
        '-hls_list_size', '0',
        '-hls_playlist_type', 'vod',
        '-hls_segment_type', 'mpegts',
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', segmentPattern,
        playlistPathNormalized,
      );

      this.logger.info({ plexId, args }, 'Starting ffmpeg VOD build');

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn(this.env.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        this.processes.set(plexId, ffmpeg);

        ffmpeg.stderr.on('data', (chunk) => {
          this.logger.debug({ plexId, ffmpeg: chunk.toString() }, 'ffmpeg stderr');
        });

        ffmpeg.once('error', (err) => {
          this.processes.delete(plexId);
          this.logger.error({ plexId, err }, 'ffmpeg failed to spawn');
          reject(err);
        });

        ffmpeg.on('close', (code, signal) => {
          this.processes.delete(plexId);
          if (code === 0) {
            this.logger.info({ plexId }, 'ffmpeg VOD build completed');
            resolve();
          } else {
            const error = new Error(`ffmpeg exited with code=${code} signal=${signal}`);
            this.logger.error({ plexId, code, signal, err: error }, 'ffmpeg VOD build failed');
            reject(error);
          }
        });
      });

    })()
      .then(() => this.completedBuilds.add(plexId))
      .catch((err) => this.logger.error({ plexId, err }, 'VOD build failed'))
      .finally(() => this.vodBuilds.delete(plexId));

    this.vodBuilds.set(plexId, job);
  }

  async shutdown() {
    const processes = [...this.processes.entries()];
    await Promise.all(
      processes.map(([plexId, proc]) => {
        if (!proc || proc.killed) return Promise.resolve();
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (!proc.killed) proc.kill('SIGKILL');
          }, 2000);
          proc.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
          proc.kill('SIGTERM');
        }).catch((err) => this.logger.warn({ plexId, err }, 'Failed to stop ffmpeg during shutdown'));
      }),
    );
    this.processes.clear();
    await Promise.allSettled(this.vodBuilds.values());
    this.vodBuilds.clear();
  }
}

const createVodService = ({ env, logger }) => new VodService({ env, logger });

module.exports = { createVodService };
