
const express = require('express');
const logger = require('../logger');

const createUiRouter = ({ plexClient, slotManager, atlasManager }) => {
  const router = express.Router();

  // Home Route - Fixed Endpoint
  router.get('/home', async (req, res) => {
    try {
      await handleHome(req, res);
    } catch (err) {
      logger.error({ err }, 'UI Home Handler Error');
      res.json(createErrorResponse("Internal Server Error"));
    }
  });

  // Slot Route - Dynamic Content
  router.get('/slots/:slotId', async (req, res) => {
    const slotId = req.params.slotId;
    const mappedId = slotManager.getPlexId(slotId);

    if (!mappedId) {
      return res.json(createErrorResponse("Slot not found or expired"));
    }

    try {
      if (mappedId.startsWith('details:')) {
        const ratingKey = mappedId.split(':')[1];
        const metadata = await plexClient.getMetadata(ratingKey);
        
        // Return Details View
        // Assign slot for the image
        const imageSlotId = slotManager.assignSlot(metadata.ratingKey);

        res.json({
          schema: "vrc-media-ui",
          version: 1,
          screenType: "details",
          title: metadata.title,
          subtitle: metadata.year ? String(metadata.year) : "",
          description: metadata.summary,
          imageSlotId: imageSlotId,
          // You might want to assign a slot for the background/poster here too if needed for details view
          // For now, let's just return text data
          metadata: {
             ratingKey: metadata.ratingKey,
             type: metadata.type,
             duration: metadata.duration
          }
        });
      } else {
        res.json(createErrorResponse("Unknown slot type"));
      }
    } catch (err) {
      logger.error({ err, slotId, mappedId }, 'UI Slot Handler Error');
      res.json(createErrorResponse("Error loading slot content"));
    }
  });

  function createErrorResponse(msg) {
    return {
      schema: "vrc-media-ui",
      version: 1,
      screenType: "error",
      title: "Error",
      message: msg
    };
  }

  async function handleHome(req, res) {
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
      
      // Assign a slot for the "Click" action
      const actionSlotId = slotManager.assignSlot(`details:${meta.ratingKey}`);

      return {
        id: meta.ratingKey,
        slotId: item.slotId, // Image slot
        actionSlotId: actionSlotId, // API Action slot
        atlasIndex: item.atlasIndex, // Index in the atlas (0-39)
        label: meta.title,
        subLabel: (meta.year || '') + (meta.type ? ` · ${meta.type}` : '')
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

