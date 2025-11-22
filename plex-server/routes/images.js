const express = require('express');
const logger = require('../logger');

const createImageRouter = ({ plexClient }) => {
  const router = express.Router();

  router.get('/movies/:plexId/:image', async (req, res) => {
    const { plexId, image } = req.params;
    try {
      const metadata = await plexClient.getMetadata(plexId);
      console.log(metadata)
      let file;
      if (image.includes("poster")) file = metadata.thumb
      if (image.includes("background")) file = metadata.art

      if (!file) {
        res.status(404).send('Image type not found! ' + image);
        return;
      }

      const response = await plexClient.getAssetStream(file);
      
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

