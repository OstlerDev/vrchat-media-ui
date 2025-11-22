
const express = require('express');
const logger = require('../logger');

const createImageRouter = ({ plexClient, slotManager }) => {
  const router = express.Router();

  // Slot-based image handler
  // Matches /imgs/slots/123.jpg or just /imgs/slots/123
  router.get('/slots/:slotId', async (req, res) => {
    // Remove extension if present (e.g. "0.jpg" -> "0")
    const slotIdRaw = req.params.slotId;
    const slotId = slotIdRaw.split('.')[0];

    const plexId = slotManager.getPlexId(slotId);

    if (!plexId) {
      res.status(404).send('Slot is empty or expired');
      return;
    }

    try {
      const metadata = await plexClient.getMetadata(plexId);
      const thumb = metadata.thumb;

      if (!thumb) {
        res.status(404).send('Media has no thumbnail');
        return;
      }

      // Resize to VRChat-safe dimensions (512x768)
      const response = await plexClient.getTranscodedImage(thumb, 128, 192);
      
      res.set('Content-Type', response.headers['content-type']);
      response.data.pipe(res);
    } catch (err) {
      logger.error({ err, slotId, plexId }, 'Failed to serve slot image');
      res.status(500).send('Error serving slot image');
    }
  });

  // Legacy/Direct handler
  router.get('/movies/:plexId/:image', async (req, res) => {
    const { plexId, image } = req.params;
    try {
      const metadata = await plexClient.getMetadata(plexId);
      let file;
      if (image.includes("poster")) file = metadata.thumb
      if (image.includes("background")) file = metadata.art

      if (!file) {
        res.status(404).send('Image type not found! ' + image);
        return;
      }

      // Also resize direct requests
      const response = await plexClient.getTranscodedImage(file, 512, 768);
      
      res.set('Content-Type', response.headers['content-type']);
      response.data.pipe(res);
    } catch (err) {
      logger.error({ err, plexId }, 'Failed to serve poster');
      res.status(500).send('Error serving poster');
    }
  });

  return router;
};

module.exports = { createImageRouter };
