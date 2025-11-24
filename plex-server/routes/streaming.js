const express = require('express');
const logger = require('../logger');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const createStreamingRouter = ({ vodService, slotManager }) => {
  if (!vodService) {
    throw new Error('vodService is required');
  }

  const router = express.Router();

  // Standard Plex ID routes
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

  // Slot-based routes
  if (slotManager) {
    // Handle short URL /stream/slots/:slotId and /stream/slots/:slotId/index.m3u8
    const handleSlotPlaylist = asyncHandler(async (req, res) => {
        const { slotId } = req.params;
        const mappedId = slotManager.getPlexId(slotId);

        if (!mappedId) {
            return res.status(404).send("Slot not found or expired");
        }

        // Expecting format "stream:12345"
        if (!mappedId.startsWith('stream:')) {
            return res.status(400).send("Invalid slot type for streaming");
        }

        const plexId = mappedId.split(':')[1];
        const playlist = await vodService.getPlaylist(plexId);
        
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/vnd.apple.mpegurl').send(playlist);
    });

    router.get('/stream/slots/:slotId', handleSlotPlaylist);
    router.get('/stream/slots/:slotId/index.m3u8', handleSlotPlaylist);

    router.get(
      '/stream/slots/:slotId/:segmentName',
      asyncHandler(async (req, res) => {
        const { slotId, segmentName } = req.params;
        const mappedId = slotManager.getPlexId(slotId);

        if (!mappedId || !mappedId.startsWith('stream:')) {
             return res.status(404).send("Segment not found");
        }

        const plexId = mappedId.split(':')[1];
        await vodService.streamSegment({ plexId, segmentName, res });
      }),
    );
  }

  return router;
};

module.exports = { createStreamingRouter };
