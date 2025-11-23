
const express = require('express');
const { createStreamingRouter } = require('./routes/streaming');
const { createImageRouter } = require('./routes/images');
const { createUiRouter } = require('./routes/ui');
const logger = require('./logger');

const createRouter = ({ isHealthy, vodService, plexClient, slotManager, atlasManager }) => {
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
    router.use('/imgs', createImageRouter({ plexClient, slotManager, atlasManager }));
    router.use('/ui', createUiRouter({ plexClient, slotManager, atlasManager }));

    router.get(/^\/(tt\d+)$/, async (req, res, next) => {
      const imdbId = req.params[0];
      try {
        const media = await plexClient.findByImdbId(imdbId);
        if (!media) {
          return res.status(404).send('Media not found');
        }
        const playlist = await vodService.getPlaylist(media.ratingKey);
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/vnd.apple.mpegurl').send(playlist);
      } catch (err) {
        logger.error({ err, imdbId }, 'Failed to handle IMDb request');
        next(err);
      }
    });
  } else {
    logger.error('Plex client not provided');
    process.exit(-1)
  }

  router.use(createStreamingRouter({ vodService }));

  router.use((req, res) => {
    logger.warn({ method: req.method, url: req.url, ip: req.ip }, '404 Not Found');
    res.status(404).json({ error: 'Not Found' });
  });

  return router;
};

module.exports = { createRouter };
