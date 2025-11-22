
const express = require('express');
const logger = require('../logger');

const createUiRouter = ({ plexClient, slotManager }) => {
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

    // Transform to UI Items
    const items = recentItems.map(meta => {
      // Assign a slot to this item
      const slotId = slotManager.assignSlot(meta.ratingKey);

      return {
        id: meta.ratingKey,
        slotId: slotId,
        label: meta.title,
        subLabel: (meta.year || '') + (meta.type ? ` · ${meta.type}` : ''),
        // The client will likely ignore 'thumb' if it uses the slot system strictly,
        // but we provide the slot-based URL just in case.
        thumb: `/imgs/slots/${slotId}`, 
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

