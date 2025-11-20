const express = require('express');
const UI = require('./ui/api.js')

const createRouter = (isHealthy) => {
  if (typeof isHealthy !== 'function') {
    throw new TypeError('isHealthy must be a function');
  }

  const router = express.Router();

  router.get('/', (_req, res) => {
    res.type('text/plain').send('online');
  });

  router.get('/health', (_req, res) => {
    if (!isHealthy()) {
      res.status(503).json({ healthy: false });
      return;
    }

    res.json({ healthy: true });
  });

  const uiHandler = UI()
  router.get('/ui', (_req, res) => uiHandler.handleAPIRequest(_req, res));

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return router;
};

module.exports = { createRouter };

