const express = require('express');
const UI = require('./ui/api.js')

// 1x1 gray pixel
const PLACEHOLDER_JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAJgABAAAAAAAAAAAAAAAAAAAAAxABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=', 'base64');

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

  // Mock Image Handler (serves placeholder for any /imgs/* request)
  router.get('/imgs/*', (_req, res) => {
     res.set('Content-Type', 'image/jpeg');
     res.send(PLACEHOLDER_JPG);
  });

  const uiHandler = new UI(); // api.js now exports a class
  router.get('/ui', (_req, res) => uiHandler.handleAPIRequest(_req, res));

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return router;
};

module.exports = { createRouter };
