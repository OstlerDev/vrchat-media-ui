const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { PassThrough } = require('stream');
const { createPlexClient } = require('../lib/plexClient');

const SEGMENT_NAME_REGEX = /^segment_(\d{5})\.ts$/i;

class JitEncoder {
  constructor({ env, logger }) {
    if (!env) {
      throw new Error('env is required to create JitEncoder');
    }

    if (!logger) {
      throw new Error('logger is required to create JitEncoder');
    }

    this.env = env;
    this.logger = logger.child({ module: 'JitEncoder' });
    this.segmentDuration = Number(env.hlsSegmentDuration) || 4;
    this.defaultDurationSeconds = Number(env.jitFallbackDurationSeconds || 600);
    this.cacheRoot = path.resolve(env.streamCacheDir, 'jit');
    this.plexClient = createPlexClient({ env, logger: this.logger });
    this.segmentBuilds = new Map();
    this.processes = new Map();
    this.sourceUrlCache = new Map();

    fs.mkdirSync(this.cacheRoot, { recursive: true });
  }

  cacheKeyFor(plexId, segmentName) {
    return `${plexId}:${segmentName}`;
  }

  cacheDirFor(plexId) {
    return path.resolve(this.cacheRoot, String(plexId));
  }

  async ensureCacheDir(plexId) {
    await fsp.mkdir(this.cacheDirFor(plexId), { recursive: true });
  }

  segmentIndexFromName(segmentName) {
    const match = segmentName?.match(SEGMENT_NAME_REGEX);
    if (!match) {
      return null;
    }
    return Number.parseInt(match[1], 10);
  }

  segmentPathFor(plexId, segmentName) {
    const cacheDir = this.cacheDirFor(plexId);
    if (!SEGMENT_NAME_REGEX.test(segmentName)) {
      return null;
    }

    const resolved = path.resolve(cacheDir, segmentName);
    const safePrefix = `${cacheDir}${path.sep}`;

    if (!resolved.startsWith(safePrefix)) {
      return null;
    }

    return resolved;
  }

  async getPlaylist(plexId) {
    const metadata = await this.plexClient.getMetadata(plexId);
    const totalSeconds = this.resolveDurationSeconds(metadata);
    const targetDuration = Math.ceil(this.segmentDuration);
    const segmentCount = Math.max(1, Math.ceil(totalSeconds / this.segmentDuration));
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
      lines.push(`#EXTINF:${duration.toFixed(3)},`, segmentName);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  }

  async streamSegment({ plexId, segmentName, res }) {
    const segmentPath = this.segmentPathFor(plexId, segmentName);
    if (!segmentPath) {
      const error = new Error('Invalid segment name');
      error.statusCode = 400;
      throw error;
    }

    await this.ensureCacheDir(plexId);

    if (await this.exists(segmentPath)) {
      this.applySegmentResponseHeaders(res);
      await this.pipeFileToResponse({ segmentPath, res });
      return;
    }

    const cacheKey = this.cacheKeyFor(plexId, segmentName);
    let builder = this.segmentBuilds.get(cacheKey);
    let ownsBuilder = false;

    if (!builder) {
      builder = this.startSegmentBuild({ plexId, segmentName, segmentPath });
      this.segmentBuilds.set(cacheKey, builder);
      ownsBuilder = true;
    }

    if (ownsBuilder && res) {
      this.applySegmentResponseHeaders(res);

      const handleError = () => {
        if (!res.headersSent) {
          res.status(500).end('ffmpeg error');
        } else if (!res.writableEnded) {
          res.end();
        }
      };

      builder.tee.once('error', handleError);
      builder.tee.pipe(res);

      try {
        await builder.promise;
      } finally {
        if (typeof builder.tee.off === 'function') {
          builder.tee.off('error', handleError);
        } else {
          builder.tee.removeListener('error', handleError);
        }
        if (ownsBuilder) {
          this.segmentBuilds.delete(cacheKey);
        }
      }

      return;
    }

    try {
      await builder.promise;
    } finally {
      if (ownsBuilder) {
        this.segmentBuilds.delete(cacheKey);
      }
    }

    this.applySegmentResponseHeaders(res);
    await this.pipeFileToResponse({ segmentPath, res });
  }

  startSegmentBuild({ plexId, segmentName, segmentPath }) {
    const segmentIndex = this.segmentIndexFromName(segmentName);
    if (segmentIndex === null || segmentIndex === undefined) {
      const error = new Error('Unable to derive segment index');
      error.statusCode = 400;
      throw error;
    }

    const tee = new PassThrough();
    const promise = this.runSegmentBuild({
      plexId,
      segmentName,
      segmentPath,
      segmentIndex,
      tee,
    });

    return { tee, promise };
  }

  runSegmentBuild({ plexId, segmentName, segmentPath, segmentIndex, tee }) {
    const startSegmentBuild = async () => {
      const sourceUrl = await this.getSourceUrl(plexId);
      const startTimeSeconds = segmentIndex * this.segmentDuration;
      const args = this.buildFfmpegArgs({ sourceUrl, startTimeSeconds });
      const tmpPath = `${segmentPath}.tmp`;

      this.logger.info({ plexId, segmentName, startTimeSeconds }, 'Starting JIT encode');

      return new Promise((resolve, reject) => {
        const ffmpeg = spawn(this.env.ffmpegPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const processKey = this.cacheKeyFor(plexId, segmentName);
        this.processes.set(processKey, ffmpeg);

        const fileStream = fs.createWriteStream(tmpPath);
        let settled = false;

        const cleanup = () => {
          this.processes.delete(processKey);
        };

        const safeReject = (err) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(err);
        };

        const safeResolve = () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        };

        const handleError = (err) => {
          cleanup();
          tee.destroy(err);
          fileStream.destroy();
          fsp.rm(tmpPath, { force: true }).catch(() => {});
          safeReject(err);
        };

        ffmpeg.once('error', handleError);

        ffmpeg.stderr.on('data', (chunk) => {
          this.logger.debug(
            { plexId, segmentName, ffmpeg: chunk.toString() },
            'ffmpeg stderr (jit)',
          );
        });

        ffmpeg.stdout.pipe(tee);
        tee.pipe(fileStream);

        fileStream.once('error', handleError);

        ffmpeg.once('close', (code, signal) => {
          cleanup();
          if (code !== 0) {
            const error = new Error(`ffmpeg exited with code=${code} signal=${signal}`);
            this.logger.error({ plexId, segmentName, code, signal }, 'JIT encode failed');
            handleError(error);
            return;
          }

          const finalize = () => {
            fs.rename(tmpPath, segmentPath, (renameErr) => {
              if (renameErr) {
                this.logger.warn({ plexId, segmentName, err: renameErr }, 'Failed to cache segment');
                handleError(renameErr);
                return;
              }

              this.logger.info({ plexId, segmentName }, 'Segment cached');
              safeResolve();
            });
          };

          if (fileStream.closed) {
            finalize();
          } else {
            fileStream.once('close', finalize);
          }
        });
      });
    };

    return startSegmentBuild();
  }

  buildFfmpegArgs({ sourceUrl, startTimeSeconds }) {
    const args = [
      '-hide_banner',
      '-loglevel',
      this.env.ffmpegLogLevel || 'error',
      '-ss',
      startTimeSeconds.toFixed(3),
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
        args.push('-level:v', '4.1');
        args.push('-r', '30');
        args.push('-g', '120');
        args.push('-keyint_min', '120');
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
      if (this.env.audioCodec !== 'copy') {
        args.push('-ac', '2', '-ar', '48000');
      }

      if (this.env.audioCodec !== 'copy' && this.env.audioBitrate) {
        args.push('-b:a', this.env.audioBitrate);
      }
    }

    args.push(
      '-t',
      this.segmentDuration.toString(),
      '-f',
      'mpegts',
      '-muxdelay',
      '0',
      '-muxpreload',
      '0',
      'pipe:1',
    );

    return args;
  }

  async pipeFileToResponse({ segmentPath, res }) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(segmentPath);
      let resolved = false;

      const cleanup = () => {
        stream.destroy();
      };

      const safeResolve = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve();
      };

      stream.once('error', (err) => {
        cleanup();
        reject(err);
      });

      res.once('close', () => {
        cleanup();
        safeResolve();
      });

      stream.once('end', () => {
        cleanup();
        safeResolve();
      });

      stream.pipe(res);
    });
  }

  applySegmentResponseHeaders(res) {
    if (!res || res.headersSent) {
      return;
    }

    if (typeof res.status === 'function') {
      res.status(200);
    } else {
      res.statusCode = 200;
    }

    if (typeof res.type === 'function') {
      res.type('video/mp2t');
    } else if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }

    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
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

  async exists(target) {
    try {
      await fsp.access(target, fs.constants.R_OK);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  async getSourceUrl(plexId) {
    if (this.sourceUrlCache.has(plexId)) {
      return this.sourceUrlCache.get(plexId);
    }

    const url = await this.plexClient.getPrimaryPartStreamUrl(plexId);
    this.sourceUrlCache.set(plexId, url);
    return url;
  }

  async shutdown() {
    const processes = [...this.processes.entries()];
    await Promise.allSettled(
      processes.map(([cacheKey, proc]) => {
        if (!proc || proc.killed) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 2000);

          proc.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });

          proc.kill('SIGTERM');
        }).catch((err) => {
          this.logger.warn({ cacheKey, err }, 'Failed to stop ffmpeg for JIT encoder');
        });
      }),
    );

    this.processes.clear();
    this.segmentBuilds.clear();
  }
}

const createJitEncoder = ({ env, logger }) => new JitEncoder({ env, logger });

module.exports = { createJitEncoder };
