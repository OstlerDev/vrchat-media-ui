
const express = require('express');
const { createRouter } = require('./routes');
const logger = require('./logger');
const { env } = require('./config/env');
const { createVodService } = require('./services/vodService');
const { createPlexClient } = require('./lib/plexClient');
const { createSlotManager } = require('./services/slotManager');

const PORT = env.port;
const app = express();

// Middleware to log all HTTP requests
app.use((req, res, next) => {
  const start = Date.now();
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer')
  }, 'HTTP Request');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    }, 'HTTP Response');
  });

  next();
});

const plexClient = createPlexClient({ env, logger });
const slotManager = createSlotManager();

// Initial cache population
plexClient.refreshCache().catch(err => 
  logger.error({ err }, 'Failed to populate Plex cache on startup')
);

const vodService = createVodService({ env, logger });

let isOnline = false;

app.use(
  createRouter({
    isHealthy: () => isOnline,
    vodService,
    plexClient,
    slotManager,
  }),
);

const server = app.listen(PORT, () => {
  isOnline = true;
  logger.info({ port: PORT }, 'plex-server listening');
});

const shutdown = async () => {
  try {
    if (vodService && typeof vodService.shutdown === 'function') {
      await vodService.shutdown();
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
