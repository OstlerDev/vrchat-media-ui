const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { createPlexClient } = require('../lib/plexClient');

const SEGMENT_NAME_REGEX = /^segment_(\d{5})\.ts$/i;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeForFfmpeg = (filePath) =>
  process.platform === 'win32' ? filePath.replace(/\\/g, '/') : filePath;

class VodService {
  constructor({ env, logger }) {
    if (!env) {
      throw new Error('env is required for VodService');
    }
    if (!logger) {
      throw new Error('logger is required for VodService');
    }

    this.env = env;
    this.logger = logger.child({ module: 'VodService' });
    this.plexClient = createPlexClient({ env, logger: this.logger });

    // Hybrid/Vod config
    this.segmentDuration = Number(env.hlsSegmentDuration) || 4;
    this.minSegmentsBeforeReady = Number(env.hybridMinReadySegments) || 10;
    this.maxPlaylistSegments = Number(env.hybridMaxPlaylistSegments) || 20;
    this.segmentWaitTimeoutMs = Number(env.hybridSegmentWaitTimeoutMs) || 15_000;
    this.segmentPollIntervalMs = Number(env.hybridSegmentPollIntervalMs) || 500;
    this.segmentReadTimeoutMs = Number(env.hybridSegmentReadTimeoutMs) || 10_000;
    this.segmentReadPollMs = Number(env.hybridSegmentReadPollMs) || 200;
    this.defaultDurationSeconds = Number(env.jitFallbackDurationSeconds || 600);

    // State
    this.vodBuilds = new Map(); // map of plexId -> Promise (build job)
    this.completedBuilds = new Set();
    this.processes = new Map(); // map of plexId -> ChildProcess

    // Ensure cache dir
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

  async getPlaylist(plexId) {
    this.triggerVodBuild(plexId);

    const readySegments = await this.waitForInitialSegments(plexId);
    if (!readySegments.length) {
      const error = new Error('Segments not ready yet');
      error.statusCode = 503;
      throw error;
    }

    return this.buildGeneratedPlaylist({ plexId });
  }

  async streamSegment({ plexId, segmentName, res }) {
    if (!SEGMENT_NAME_REGEX.test(segmentName)) {
      const error = new Error('Invalid segment name');
      error.statusCode = 400;
      throw error;
    }

    this.triggerVodBuild(plexId);
    const segmentPath = this.resolveSegmentPath(plexId, segmentName);
    if (!segmentPath) {
      const error = new Error('Invalid segment path');
      error.statusCode = 400;
      throw error;
    }

    await this.waitForSegmentFile(segmentPath);

    res.status(200);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('video/mp2t');

    await this.pipeFile({ filePath: segmentPath, res });
  }

  triggerVodBuild(plexId) {
    if (this.completedBuilds.has(plexId) || this.vodBuilds.has(plexId)) {
      return;
    }

    const job = this.ensureVod(plexId)
      .then(() => {
        this.completedBuilds.add(plexId);
      })
      .catch((err) => {
        this.logger.error({ plexId, err }, 'VOD build failed');
      })
      .finally(() => {
        this.vodBuilds.delete(plexId);
      });

    this.vodBuilds.set(plexId, job);
  }

  async ensureVod(plexId) {
    const playlistPath = this.playlistPathFor(plexId);
    
    // If we already have a complete VOD on disk (from a previous run, perhaps?), 
    // we might not need to rebuild.
    // However, HybridVod usually relies on fresh builds or checks.
    // The original VodCache check:
    if (await this.exists(playlistPath)) {
      return;
    }

    await this.buildVod(plexId);
  }

  async buildVod(plexId) {
    const plexDir = this.cacheDirFor(plexId);
    const playlistPath = this.playlistPathFor(plexId);

    // Clean up previous build artifacts
    await fsp.rm(plexDir, { recursive: true, force: true });
    await fsp.mkdir(plexDir, { recursive: true });

    const sourceUrl = await this.plexClient.getPrimaryPartStreamUrl(plexId);
    const args = this.buildFfmpegArgs({ sourceUrl, plexId });

    this.logger.info({ plexId, args }, 'Starting ffmpeg VOD build');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.env.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
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
  }

  buildFfmpegArgs({ sourceUrl, plexId }) {
    const args = [
      '-hide_banner',
      '-y',
      '-loglevel',
      this.env.ffmpegLogLevel || 'error',
      '-i',
      sourceUrl,
      '-max_delay',
      String(this.env.ffmpegMaxDelay),
      '-probesize',
      String(this.env.ffmpegProbeSize),
      '-analyzeduration',
      String(this.env.ffmpegAnalyzeDuration),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-map',
      '-0:s',
      '-map',
      '-0:d',
    ];

    if (this.env.videoCodec) {
      args.push('-c:v', this.env.videoCodec);
      if (this.env.videoCodec !== 'copy') {
        args.push('-profile:v', 'high');
      }
      if (this.env.videoCodec !== 'copy' && this.env.videoBitrate) {
        args.push('-b:v', this.env.videoBitrate);
      }
      if (this.env.ffmpegPreset && this.env.videoCodec !== 'copy') {
        args.push('-preset', this.env.ffmpegPreset);
      }
      if (this.env.ffmpegCrf && this.env.videoCodec !== 'copy') {
        args.push('-crf', String(this.env.ffmpegCrf));
      }
    }

    args.push('-level:v', '4.1');
    args.push('-r', '30'); // 30 fps
    args.push('-g', '120');
    args.push('-keyint_min', '120');

    if (this.env.audioCodec) {
      args.push('-c:a', 'aac');
      if (this.env.audioCodec !== 'copy' && this.env.audioBitrate) {
        args.push('-b:a', this.env.audioBitrate);
      }
    }

    args.push('-ac', '2');
    args.push('-ar', '48000');

    const segmentPattern = normalizeForFfmpeg(this.segmentPatternFor(plexId));
    const playlistPath = normalizeForFfmpeg(this.playlistPathFor(plexId));

    args.push(
      '-f', 'hls',
      '-hls_time', String(this.env.hlsSegmentDuration),
      '-hls_list_size', '0',
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', segmentPattern,
      playlistPath,
    );

    return args;
  }

  async waitForInitialSegments(plexId) {
    const start = Date.now();
    while (Date.now() - start < this.segmentWaitTimeoutMs) {
      const segments = await this.listSegments(plexId);
      if (segments.length >= this.minSegmentsBeforeReady) {
        return segments.slice(-this.maxPlaylistSegments);
      }

      if (segments.length > 0 && Date.now() - start > this.segmentPollIntervalMs * 3) {
        return segments.slice(-this.maxPlaylistSegments);
      }

      await delay(this.segmentPollIntervalMs);
    }

    return this.listSegments(plexId).then((segments) =>
      segments.slice(-this.maxPlaylistSegments),
    );
  }

  async waitForSegmentFile(segmentPath) {
    const start = Date.now();
    while (Date.now() - start < this.segmentReadTimeoutMs) {
      try {
        await fsp.access(segmentPath, fs.constants.R_OK);
        return;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      await delay(this.segmentReadPollMs);
    }

    throw new Error('Segment not ready');
  }

  async listSegments(plexId) {
    const dir = this.cacheDirFor(plexId);
    let entries;
    try {
      entries = await fsp.readdir(dir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    return entries
      .filter((name) => SEGMENT_NAME_REGEX.test(name))
      .sort((a, b) => {
        if (a === b) return 0;
        return a < b ? -1 : 1;
      });
  }

  async buildGeneratedPlaylist({ plexId }) {
    const metadata = await this.plexClient.getMetadata(plexId);
    const totalSeconds = this.resolveDurationSeconds(metadata);
    const targetDuration = Math.ceil(this.segmentDuration);
    const segmentCount = Math.max(1, Math.ceil(totalSeconds / this.segmentDuration));
    const basePath = `/stream/movies/${plexId}/`;
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
    ];

    for (let i = 0; i < segmentCount; i += 1) {
      const isLast = i === segmentCount - 1;
      const remaining = totalSeconds - this.segmentDuration * i;
      const duration = isLast ? Math.max(remaining, 0.1) : this.segmentDuration;
      const segmentName = `segment_${String(i).padStart(5, '0')}.ts`;
      lines.push(`#EXTINF:${duration.toFixed(3)},`, `${basePath}${segmentName}`);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  }

  resolveSegmentPath(plexId, segmentName) {
    const dir = this.cacheDirFor(plexId);
    const resolved = path.resolve(dir, segmentName);
    const safePrefix = `${dir}${path.sep}`;
    if (!resolved.startsWith(safePrefix)) {
      return null;
    }
    return resolved;
  }

  async pipeFile({ filePath, res }) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      const cleanup = () => {
        stream.destroy();
      };

      stream.once('error', (err) => {
        cleanup();
        reject(err);
      });

      res.once('close', () => {
        cleanup();
        resolve();
      });

      stream.once('end', () => {
        cleanup();
        resolve();
      });

      stream.pipe(res);
    });
  }

  async exists(target) {
    try {
      await fsp.access(target);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  resolveDurationSeconds(metadata) {
    const rawMs =
      metadata?.Duration ??
      metadata?.duration ??
      metadata?.Media?.[0]?.Duration ??
      metadata?.Media?.[0]?.duration ??
      metadata?.Media?.[0]?.Part?.[0]?.Duration ??
      metadata?.Media?.[0]?.Part?.[0]?.duration;

    if (Number.isFinite(Number(rawMs))) {
      return Number(rawMs) / 1000;
    }

    return this.defaultDurationSeconds;
  }

  async shutdown() {
    const processes = [...this.processes.entries()];
    await Promise.all(
      processes.map(([plexId, proc]) => {
        if (!proc || proc.killed) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 2000);

          proc.once('close', () => {
            clearTimeout(timer);
            resolve();
          });

          proc.kill('SIGTERM');
        }).catch((err) => {
          this.logger.warn({ plexId, err }, 'Failed to stop ffmpeg during shutdown');
        });
      }),
    );
    this.processes.clear();
    await Promise.allSettled(this.vodBuilds.values());
    this.vodBuilds.clear();
  }
}

const createVodService = ({ env, logger }) => new VodService({ env, logger });

module.exports = { createVodService };

