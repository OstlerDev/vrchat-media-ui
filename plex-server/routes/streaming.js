
const express = require('express');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const createStreamingRouter = ({ vodService }) => {
  if (!vodService) {
    throw new Error('vodService is required');
  }

  const router = express.Router();

  router.get(
    '/stream/movies/:plexId/index.m3u8',
    asyncHandler(async (req, res) => {
      const { plexId } = req.params;
      const playlist = await vodService.getPlaylist(plexId);
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/vnd.apple.mpegurl').send(playlist);
    }),
  );

  router.get(
    '/stream/movies/:plexId/:segmentName',
    asyncHandler(async (req, res) => {
      const { plexId, segmentName } = req.params;

      await vodService.streamSegment({ plexId, segmentName, res });
    }),
  );

  return router;
};

module.exports = { createStreamingRouter };
