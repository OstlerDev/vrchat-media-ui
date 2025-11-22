const express = require('express');
const { createStreamingRouter } = require('./routes/streaming');
const { createImageRouter } = require('./routes/images');
const logger = require('./logger');

const createRouter = ({ isHealthy, vodCache, jitEncoder, hybridVod, plexClient }) => {
  if (typeof isHealthy !== 'function') {
    throw new TypeError('isHealthy must be a function');
  }

  const router = express.Router();

  router.get('/', (_req, res) => {
    res.type('text/plain').send('plex-server online');
  });

  router.get('/health', (_req, res) => {
    if (!isHealthy()) {
      res.status(503).json({ healthy: false });
      return;
    }

    res.json({ healthy: true });
  });

  if (plexClient) {
    router.use('/imgs', createImageRouter({ plexClient }));
  } else {
    logger.error('Plex client not provided');
    process.exit(-1)
  }

  router.use(createStreamingRouter({ vodCache, jitEncoder, hybridVod }));

  router.use((req, res) => {
    logger.warn({ method: req.method, url: req.url, ip: req.ip }, '404 Not Found');
    res.status(404).json({ error: 'Not Found' });
  });

  return router;
};

module.exports = { createRouter };
