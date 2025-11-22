const express = require('express');
const { createStreamingRouter } = require('./routes/streaming');

const createRouter = ({ isHealthy, vodCache, jitEncoder, hybridVod }) => {
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

  router.use(createStreamingRouter({ vodCache, jitEncoder, hybridVod }));

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return router;
};

module.exports = { createRouter };
