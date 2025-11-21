const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { createPlexClient } = require('../lib/plexClient');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForFile = async (filePath, timeoutMs = 15_000, pollMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      await fsp.access(filePath);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
};

const normalizeForFfmpeg = (filePath) =>
  process.platform === 'win32' ? filePath.replace(/\\/g, '/') : filePath;

class StreamSession {
  constructor({ plexId, env, logger, plexClient }) {
    this.plexId = plexId;
    this.env = env;
    this.logger = logger.child({ plexId });
    this.plexClient = plexClient;
    this.segmentDuration = env.hlsSegmentDuration;
    this.windowSize = env.hlsWindowSegments;
    this.sessionTtlMs = env.sessionTtlMs;
    this.sessionDir = path.resolve(env.streamCacheDir, `${plexId}-${Date.now()}`);
    this.playlistPath = path.join(this.sessionDir, 'index.m3u8');
    this.segmentPattern = normalizeForFfmpeg(path.join(this.sessionDir, 'segment_%05d.ts'));
    this.lastAccess = Date.now();
    this.ended = false;
    this.readyPromise = this.start();
  }

  async start() {
    await fsp.mkdir(this.sessionDir, { recursive: true });
    const sourceUrl = await this.plexClient.getPrimaryPartStreamUrl(this.plexId);
    await this.spawnFfmpeg(sourceUrl);
    await waitForFile(this.playlistPath);
  }

  async spawnFfmpeg(sourceUrl) {
    const args = this.buildFfmpegArgs(sourceUrl);
    this.logger.info({ args }, 'Starting ffmpeg session');

    await new Promise((resolve, reject) => {
      let settled = false;
      console.log(args.join(" "))
      this.ffmpeg = spawn(this.env.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      this.ffmpeg.once('spawn', () => {
        settled = true;
        resolve();
      });

      this.ffmpeg.once('error', (err) => {
        this.logger.error({ err }, 'ffmpeg failed to spawn');
        if (!settled) {
          reject(err);
        }
      });

      this.ffmpeg.stderr.on('data', (chunk) => {
        this.logger.debug({ ffmpeg: chunk.toString() }, 'ffmpeg stderr');
      });

      this.ffmpeg.on('close', (code, signal) => {
        this.logger.info({ code, signal }, 'ffmpeg session closed');
        this.ended = true;
      });
    });
  }

  buildFfmpegArgs(sourceUrl) {
    const args = [
      '-hide_banner',
      '-loglevel', this.env.ffmpegLogLevel || 'error',
      '-re',
      '-i', sourceUrl,
      '-max_delay', String(this.env.ffmpegMaxDelay),
      '-probesize', String(this.env.ffmpegProbeSize),
      '-analyzeduration', String(this.env.ffmpegAnalyzeDuration),
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-map', '-0:s',
      '-map', '-0:d',
    ];

    if (this.env.videoCodec) {
      args.push('-c:v', this.env.videoCodec);
      if (this.env.videoProfile && this.env.videoCodec !== 'copy') {
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

    args.push(
      '-f', 'hls',
      '-hls_time', String(this.segmentDuration),
      '-hls_list_size', String(this.windowSize),
      '-hls_flags', 'delete_segments+append_list+omit_endlist+program_date_time',
      '-hls_segment_type', 'mpegts',
      '-hls_playlist_type', 'event',
      '-hls_segment_filename', this.segmentPattern,
      this.playlistPath,
    );

    return args;
  }

  async ready() {
    return this.readyPromise;
  }

  async getPlaylist() {
    try {
      const playlist = await fsp.readFile(this.playlistPath, 'utf8');
      return this.rewritePlaylist(playlist);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async getSegment(segmentName) {
    const filePath = this.resolveSegmentPath(segmentName);
    if (!filePath) {
      return null;
    }

    try {
      return await fsp.readFile(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  resolveSegmentPath(fileName) {
    if (!fileName) {
      return null;
    }
    const resolved = path.resolve(this.sessionDir, fileName);
    if (!resolved.startsWith(this.sessionDir)) {
      return null;
    }
    return resolved;
  }

  rewritePlaylist(rawPlaylist) {
    const basePath = `/stream/movies/${this.plexId}/`;
    const lines = rawPlaylist.split('\n');
    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      // Only rewrite simple filenames so we don't break absolute URLs.
      if (/^[a-zA-Z0-9_.-]+\.ts$/i.test(trimmed) || /^[a-zA-Z0-9_.-]+\.key$/i.test(trimmed)) {
        return `${basePath}${trimmed}`;
      }

      return line;
    });

    return rewritten.join('\n');
  }

  touch() {
    this.lastAccess = Date.now();
  }

  isExpired(now = Date.now()) {
    return now - this.lastAccess > this.sessionTtlMs;
  }

  async stop() {
    if (this.ffmpeg && !this.ffmpeg.killed) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!this.ffmpeg.killed) {
            this.ffmpeg.kill('SIGKILL');
          }
          resolve();
        }, 2000);

        this.ffmpeg.once('close', () => {
          clearTimeout(timer);
          resolve();
        });

        this.ffmpeg.kill('SIGTERM');
      });
    }

    await fsp.rm(this.sessionDir, { recursive: true, force: true }).catch((err) => {
      if (err.code !== 'ENOENT') {
        this.logger.warn({ err }, 'Failed to remove session directory');
      }
    });
  }

  hasEnded() {
    return this.ended;
  }
}

class StreamSessionManager {
  constructor({ env, logger }) {
    this.env = env;
    this.logger = logger.child({ module: 'StreamSessionManager' });
    this.sessions = new Map();
    this.plexClient = createPlexClient({ env, logger });
    fs.mkdirSync(env.streamCacheDir, { recursive: true });
    this.cleanupTimer = setInterval(() => this.evictExpired(), env.sessionTtlMs);
  }

  async ensureSession(plexId) {
    let session = this.sessions.get(plexId);
    if (!session || session.hasEnded()) {
      if (session) {
        await session.stop().catch((err) => this.logger.error({ err }, 'Failed to stop old session'));
      }
      session = new StreamSession({ plexId, env: this.env, logger: this.logger, plexClient: this.plexClient });
      this.sessions.set(plexId, session);
      try {
        await session.ready();
      } catch (err) {
        this.sessions.delete(plexId);
        await session.stop().catch(() => {});
        throw err;
      }
    }

    await session.ready();
    session.touch();
    return session;
  }

  async getPlaylist(plexId) {
    const session = await this.ensureSession(plexId);
    return session.getPlaylist();
  }

  async getSegment(plexId, segmentName) {
    const session = this.sessions.get(plexId);
    if (!session) {
      return null;
    }

    session.touch();
    return session.getSegment(segmentName);
  }

  evictExpired() {
    const now = Date.now();
    for (const [plexId, session] of this.sessions.entries()) {
      if (session.isExpired(now) || session.hasEnded()) {
        this.logger.info({ plexId }, 'Evicting expired session');
        session.stop().catch((err) => this.logger.error({ err }, 'Failed to stop expired session'));
        this.sessions.delete(plexId);
      }
    }
  }

  async shutdown() {
    clearInterval(this.cleanupTimer);
    await Promise.all([...this.sessions.values()].map((session) => session.stop()));
    this.sessions.clear();
  }
}

const createStreamSessionManager = ({ env, logger }) => new StreamSessionManager({ env, logger });

module.exports = { createStreamSessionManager };
