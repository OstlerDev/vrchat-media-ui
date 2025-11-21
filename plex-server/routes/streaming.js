const express = require('express');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const createStreamingRouter = ({ vodCache }) => {
  if (!vodCache) {
    throw new Error('vodCache is required');
  }

  const router = express.Router();

  router.get(
    '/stream/movies/:plexId/index.m3u8',
    asyncHandler(async (req, res) => {
      const { plexId } = req.params;
      const playlist = await vodCache.getPlaylist(plexId);
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/vnd.apple.mpegurl').send(playlist);
    }),
  );

  router.get(
    '/stream/movies/:plexId/:segmentName',
    asyncHandler(async (req, res) => {
      const { plexId, segmentName } = req.params;
      const segment = await vodCache.getSegment(plexId, segmentName);

      if (!segment) {
        res.status(404).json({ error: 'Segment not found' });
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.type('video/mp2t').send(segment);
    }),
  );

  return router;
};

module.exports = { createStreamingRouter };
