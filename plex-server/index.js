const express = require('express');
const { createRouter } = require('./routes');
const logger = require('./logger');
const { env } = require('./config/env');
const { createVodCache } = require('./services/vodCache');
const { createJitEncoder } = require('./services/JITencoder');
const { createHybridVod } = require('./services/hybridVod');

const PORT = env.port;
const app = express();
const providerType = env.providerType || 'VOD_CACHE';
const shouldInitVodCache = providerType === 'VOD_CACHE' || providerType === 'HYBRID';
const vodCache = shouldInitVodCache ? createVodCache({ env, logger }) : null;
const jitEncoder = providerType === 'JIT_ENCODER' ? createJitEncoder({ env, logger }) : null;
const hybridVod =
  providerType === 'HYBRID' && vodCache
    ? createHybridVod({ env, logger, vodCache })
    : null;
let isOnline = false;

app.use(
  createRouter({
    isHealthy: () => isOnline,
    vodCache,
    jitEncoder,
    hybridVod,
  }),
);

const server = app.listen(PORT, () => {
  isOnline = true;
  logger.info({ port: PORT }, 'plex-server listening');
});

const shutdown = async () => {
  try {
    if (vodCache && typeof vodCache.shutdown === 'function') {
      await vodCache.shutdown();
    }
    if (jitEncoder && typeof jitEncoder.shutdown === 'function') {
      await jitEncoder.shutdown();
    }
    if (hybridVod && typeof hybridVod.shutdown === 'function') {
      await hybridVod.shutdown();
    }
  } catch (err) {
    logger.error({ err }, 'Failed to shutdown stream manager');
  }

  server.close(() => {
    isOnline = false;
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
