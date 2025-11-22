const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { createPlexClient } = require('../lib/plexClient');

const SEGMENT_NAME_REGEX = /^segment_(\d{5})\.ts$/i;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class HybridVodService {
  constructor({ env, logger, vodCache }) {
    if (!env) {
      throw new Error('env is required for HybridVodService');
    }
    if (!logger) {
      throw new Error('logger is required for HybridVodService');
    }
    if (!vodCache) {
      throw new Error('vodCache is required for HybridVodService');
    }

    this.env = env;
    this.logger = logger.child({ module: 'HybridVod' });
    this.vodCache = vodCache;
    this.plexClient = createPlexClient({ env, logger: this.logger });

    this.segmentDuration = Number(env.hlsSegmentDuration) || 4;
    this.minSegmentsBeforeReady = Number(env.hybridMinReadySegments) || 10;
    this.maxPlaylistSegments = Number(env.hybridMaxPlaylistSegments) || 20;
    this.segmentWaitTimeoutMs = Number(env.hybridSegmentWaitTimeoutMs) || 15_000;
    this.segmentPollIntervalMs = Number(env.hybridSegmentPollIntervalMs) || 500;
    this.segmentReadTimeoutMs = Number(env.hybridSegmentReadTimeoutMs) || 10_000;
    this.segmentReadPollMs = Number(env.hybridSegmentReadPollMs) || 200;
    this.defaultDurationSeconds = Number(env.jitFallbackDurationSeconds || 600);

    this.vodBuilds = new Map();
    this.completedBuilds = new Set();
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

    const job = this.vodCache
      .ensureVod(plexId)
      .then(() => {
        this.completedBuilds.add(plexId);
      })
      .catch((err) => {
        this.logger.error({ plexId, err }, 'Hybrid VOD build failed');
      })
      .finally(() => {
        this.vodBuilds.delete(plexId);
      });

    this.vodBuilds.set(plexId, job);
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
    const dir = this.vodCache.cacheDirFor(plexId);
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
    if (typeof this.vodCache.resolveSegmentPath === 'function') {
      return this.vodCache.resolveSegmentPath(plexId, segmentName);
    }

    const dir = this.vodCache.cacheDirFor(plexId);
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

  segmentIndexFromName(segmentName) {
    const match = segmentName?.match(SEGMENT_NAME_REGEX);
    if (!match) {
      return null;
    }
    return Number.parseInt(match[1], 10);
  }

  async shutdown() {
    await Promise.allSettled(this.vodBuilds.values());
    this.vodBuilds.clear();
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
}

const createHybridVod = ({ env, logger, vodCache }) =>
  new HybridVodService({ env, logger, vodCache });

module.exports = { createHybridVod };

