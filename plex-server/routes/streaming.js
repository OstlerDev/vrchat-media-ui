const express = require('express');
const { env } = require('../config/env');

const PROVIDER_TYPE = env.providerType || 'VOD_CACHE'; // "VOD_CACHE" | "JIT_ENCODER" | "HYBRID"
const SEGMENT_NAME_REGEX = /^segment_(\d{5})\.ts$/i;

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const createStreamingRouter = ({ vodCache, jitEncoder, hybridVod }) => {
  if (PROVIDER_TYPE === 'VOD_CACHE' && !vodCache) {
    throw new Error('vodCache is required when PROVIDER_TYPE is VOD_CACHE');
  }

  if (PROVIDER_TYPE === 'JIT_ENCODER' && !jitEncoder) {
    throw new Error('jitEncoder is required when PROVIDER_TYPE is JIT_ENCODER');
  }

  if (PROVIDER_TYPE === 'HYBRID' && !hybridVod) {
    throw new Error('hybridVod is required when PROVIDER_TYPE is HYBRID');
  }

  const router = express.Router();

  router.get(
    '/stream/movies/:plexId/index.m3u8',
    asyncHandler(async (req, res) => {
      const { plexId } = req.params;
      let playlist;
      if (PROVIDER_TYPE === 'JIT_ENCODER') {
        playlist = await jitEncoder.getPlaylist(plexId);
      } else if (PROVIDER_TYPE === 'HYBRID') {
        playlist = await hybridVod.getPlaylist(plexId);
      } else {
        playlist = await vodCache.getPlaylist(plexId);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/vnd.apple.mpegurl').send(playlist);
    }),
  );

  router.get(
    '/stream/movies/:plexId/:segmentName',
    asyncHandler(async (req, res) => {
      const { plexId, segmentName } = req.params;

      if (PROVIDER_TYPE === 'JIT_ENCODER') {
        if (!SEGMENT_NAME_REGEX.test(segmentName)) {
          res.status(400).json({ error: 'Invalid segment name' });
          return;
        }

        await jitEncoder.streamSegment({ plexId, segmentName, res });
        return;
      }

      if (PROVIDER_TYPE === 'HYBRID') {
        await hybridVod.streamSegment({ plexId, segmentName, res });
        return;
      }

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
