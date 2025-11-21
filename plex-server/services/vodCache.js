const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { createPlexClient } = require('../lib/plexClient');

const normalizeForFfmpeg = (filePath) =>
  process.platform === 'win32' ? filePath.replace(/\\/g, '/') : filePath;

class VodCache {
  constructor({ env, logger }) {
    this.env = env;
    this.logger = logger.child({ module: 'VodCache' });
    this.plexClient = createPlexClient({ env, logger });
    this.builds = new Map();
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

  async getPlaylist(plexId) {
    await this.ensureVod(plexId);
    const raw = await fsp.readFile(this.playlistPathFor(plexId), 'utf8');
    return this.rewritePlaylist(plexId, raw);
  }

  async getSegment(plexId, segmentName) {
    const segmentPath = this.resolveSegmentPath(plexId, segmentName);
    if (!segmentPath) {
      return null;
    }

    try {
      return await fsp.readFile(segmentPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  resolveSegmentPath(plexId, fileName) {
    if (!fileName) {
      return null;
    }
    const dir = this.cacheDirFor(plexId);
    const resolved = path.resolve(dir, fileName);
    const safePrefix = `${dir}${path.sep}`;
    if (resolved !== dir && !resolved.startsWith(safePrefix)) {
      return null;
    }
    return resolved;
  }

  async ensureVod(plexId) {
    const playlistPath = this.playlistPathFor(plexId);
    if (await this.exists(playlistPath)) {
      return playlistPath;
    }

    let buildPromise = this.builds.get(plexId);
    if (!buildPromise) {
      buildPromise = this.buildVod(plexId);
      this.builds.set(plexId, buildPromise);
    }

    try {
      await buildPromise;
    } finally {
      this.builds.delete(plexId);
    }

    return playlistPath;
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

  async buildVod(plexId) {
    const plexDir = this.cacheDirFor(plexId);
    const playlistPath = this.playlistPathFor(plexId);

    await fsp.rm(plexDir, { recursive: true, force: true });
    await fsp.mkdir(plexDir, { recursive: true });

    const sourceUrl = await this.plexClient.getPrimaryPartStreamUrl(plexId);
    const args = this.buildFfmpegArgs({ sourceUrl, plexId });

    this.logger.info({ plexId, args }, 'Starting ffmpeg VOD build');

    await new Promise((resolve, reject) => {
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
        if (code === 0) {
          this.logger.info({ plexId }, 'ffmpeg VOD build completed');
          resolve();
        } else {
          const error = new Error(`ffmpeg exited with code=${code} signal=${signal}`);
          this.logger.error({ plexId, code, signal, err: error }, 'ffmpeg VOD build failed');
          reject(error);
        }
        this.processes.delete(plexId);
      });
    });

    await fsp.access(playlistPath);
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
      if (this.env.videoCodec !== 'copy' && this.env.videoProfile) {
        args.push('-profile:v', this.env.videoProfile);
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

    if (this.env.audioCodec) {
      args.push('-c:a', this.env.audioCodec);
      if (this.env.audioCodec !== 'copy' && this.env.audioBitrate) {
        args.push('-b:a', this.env.audioBitrate);
      }
    }

    const playlistSize = this.env.hlsWindowSegments > 0 ? this.env.hlsWindowSegments : 0;
    const segmentPattern = normalizeForFfmpeg(this.segmentPatternFor(plexId));
    const playlistPath = normalizeForFfmpeg(this.playlistPathFor(plexId));

    args.push(
      '-f',
      'hls',
      '-hls_time',
      String(this.env.hlsSegmentDuration),
      '-hls_list_size',
      String(playlistSize),
      '-hls_playlist_type',
      'vod',
      '-hls_segment_type',
      'mpegts',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      segmentPattern,
      playlistPath,
    );

    return args;
  }

  rewritePlaylist(plexId, rawPlaylist) {
    const basePath = `/stream/movies/${plexId}/`;
    return rawPlaylist
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }

        if (/^[a-zA-Z0-9_.-]+\\.ts$/i.test(trimmed) || /^[a-zA-Z0-9_.-]+\\.key$/i.test(trimmed)) {
          return `${basePath}${trimmed}`;
        }

        return line;
      })
      .join('\n');
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
    await Promise.allSettled(this.builds.values());
    this.builds.clear();
  }
}

const createVodCache = ({ env, logger }) => new VodCache({ env, logger });

module.exports = { createVodCache };

