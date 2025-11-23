
const express = require('express');
const logger = require('../logger');

const createUiRouter = ({ plexClient, slotManager, atlasManager }) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    // Default to /home if no route provided
    let route = req.query.route || '/home';
    if (route === '/') route = '/home';

    try {
      // Simple routing logic
      if (route === '/home' || route === '/grid') {
        return await handleHomeOrGrid(req, res);
      } else {
        // Fallback
        res.json({
          schema: "vrc-media-ui",
          version: 1,
          screenType: "error",
          title: "Not Found",
          message: `Route not found: ${route}`,
          actions: { back: "/home" }
        });
      }
    } catch (err) {
      logger.error({ err, route }, 'UI Handler Error');
      res.json({
        schema: "vrc-media-ui",
        version: 1,
        screenType: "error",
        title: "Error",
        message: "Internal Server Error"
      });
    }
  });

  async function handleHomeOrGrid(req, res) {
    // Fetch Recently Added from Plex
    const recentItems = await plexClient.getRecentlyAdded();

    // Prepare items for atlas generation
    const atlasInputs = recentItems.map(meta => ({
      ratingKey: meta.ratingKey,
      thumb: meta.thumb,
      // Keep metadata we need for final response
      _meta: meta
    }));

    // Generate atlases (this returns items with slotId and uv)
    const enrichedItems = await atlasManager.generateAtlases(atlasInputs);

    // Transform to UI Items
    const items = enrichedItems.map(item => {
      const meta = item._meta;
      
      return {
        id: meta.ratingKey,
        slotId: item.slotId,
        uv: item.uv,
        label: meta.title,
        subLabel: (meta.year || '') + (meta.type ? ` · ${meta.type}` : ''),
        thumb: `/imgs/slots/${item.slotId}`, // Points to the atlas
        route: `/item/${meta.ratingKey}`,
        action: 'navigate'
      };
    });

    res.json({
      schema: "vrc-media-ui",
      version: 1,
      screenType: "grid",
      title: "Recently Added",
      subtitle: "From Plex Library",
      items: items
    });
  }

  return router;
};

module.exports = { createUiRouter };

