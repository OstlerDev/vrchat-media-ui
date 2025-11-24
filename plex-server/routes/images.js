
const express = require('express');
const logger = require('../logger');

const createImageRouter = ({ plexClient, slotManager, atlasManager }) => {
  const router = express.Router();

  // Slot-based image handler
  // Matches /imgs/slots/123.jpg or just /imgs/slots/123
  router.get('/slots/:slotId', async (req, res) => {
    // Remove extension if present (e.g. "0.jpg" -> "0")
    const slotIdRaw = req.params.slotId;
    const slotId = slotIdRaw.split('.')[0];

    let plexId = slotManager.getPlexId(slotId);

    if (!plexId) {
      res.status(404).send('Slot is empty or expired');
      return;
    }

    let isBackdrop = false;
    if (plexId.startsWith('backdrop:')) {
      isBackdrop = true;
      plexId = plexId.replace('backdrop:', '');
    }

    // Check if this is an atlas request
    if (plexId.startsWith('atlas_') && atlasManager) {
      const buffer = atlasManager.getAtlas(plexId);
      if (!buffer) {
        res.status(404).send('Atlas not found or expired');
        return;
      }
      
      res.set('Content-Type', 'image/jpeg');
      res.send(buffer);
      return;
    }

    try {
      const metadata = await plexClient.getMetadata(plexId);
      const imagePath = isBackdrop ? metadata.art : metadata.thumb;

      if (!imagePath) {
        res.status(404).send('Media has no image of requested type');
        return;
      }

      // Resize to VRChat-safe dimensions
      // Poster: 512x768 (2:3)
      // Backdrop: 1024x576 (16:9)
      const width = isBackdrop ? 1024 : 512;
      const height = isBackdrop ? 576 : 768;

      const response = await plexClient.getTranscodedImage(imagePath, width, height);
      
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
