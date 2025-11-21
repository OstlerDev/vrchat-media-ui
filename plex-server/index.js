const express = require('express');
const { createRouter } = require('./routes');
const logger = require('./logger');
const { env } = require('./config/env');
const { createVodCache } = require('./services/vodCache');

const PORT = env.port;
const app = express();
const vodCache = createVodCache({ env, logger });
let isOnline = false;

app.use(
  createRouter({
    isHealthy: () => isOnline,
    vodCache,
  }),
);

const server = app.listen(PORT, () => {
  isOnline = true;
  logger.info({ port: PORT }, 'plex-server listening');
});

const shutdown = async () => {
  try {
    if (typeof vodCache.shutdown === 'function') {
      await vodCache.shutdown();
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
