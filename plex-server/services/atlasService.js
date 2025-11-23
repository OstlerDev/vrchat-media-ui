const sharp = require('sharp');
const logger = require('../logger');

const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 2048;
const THUMB_WIDTH = 256;
const THUMB_HEIGHT = 384;
const COLS = Math.floor(ATLAS_WIDTH / THUMB_WIDTH); // 8
const ROWS = Math.floor(ATLAS_HEIGHT / THUMB_HEIGHT); // 5
const ITEMS_PER_ATLAS = COLS * ROWS; // 40

class AtlasManager {
  constructor({ plexClient, slotManager }) {
    this.plexClient = plexClient;
    this.slotManager = slotManager;
    this.atlases = new Map(); // atlasId -> Buffer
    this.nextAtlasId = 0;
  }

  /**
   * Generates atlases for a list of items.
   * @param {Array} items - List of items with 'thumb' (Plex path) and 'ratingKey'
   * @returns {Promise<Array>} - Items enriched with slotId (atlas slot) and uv
   */
  async generateAtlases(items) {
    const enrichedItems = [];
    
    // Process items in chunks of ITEMS_PER_ATLAS
    for (let i = 0; i < items.length; i += ITEMS_PER_ATLAS) {
      const chunk = items.slice(i, i + ITEMS_PER_ATLAS);
      const atlasId = this.nextAtlasId++;
      
      // Assign this atlasId to a slot so it can be served via /imgs/slots/:id
      const slotId = this.slotManager.assignSlot(`atlas_${atlasId}`);
      
      // Start generating the atlas in the background (or await if we want to ensure it's ready)
      // For simplicity, we'll await it here to ensure it's ready when requested, 
      // but ideally this should be cached or handled more gracefully.
      // Given the 5s limit on VRChat side, we probably have time, but generating 40 images takes time.
      // We might want to generate it on demand or return the slot immediately and generate async.
      // But if we return immediately, the client might request it before it's ready.
      // Let's await for now.
      
      const { buffer, itemLayouts } = await this.createAtlasImage(chunk);
      this.atlases.set(`atlas_${atlasId}`, buffer);
      
      // Map chunk items to their UVs and slot
      chunk.forEach((item, index) => {
        const layout = itemLayouts[index];
        if (layout) {
          enrichedItems.push({
            ...item,
            slotId: slotId,
            uv: layout.uv
          });
        } else {
          // Fallback if image failed?
          enrichedItems.push({ ...item, slotId: -1 });
        }
      });
    }
    
    return enrichedItems;
  }

  async createAtlasImage(items) {
    const compositeOps = [];
    const itemLayouts = [];
    
    // Parallel fetch of images
    const imagePromises = items.map(async (item, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = col * THUMB_WIDTH;
      const y = row * THUMB_HEIGHT;
      
      try {
        // Fetch and resize image
        // We use getTranscodedImage to get a sized buffer if possible, 
        // but getTranscodedImage returns a stream.
        // We need a buffer for sharp composite.
        const streamResponse = await this.plexClient.getTranscodedImage(item.thumb, THUMB_WIDTH, THUMB_HEIGHT);
        const buffer = await this.streamToBuffer(streamResponse.data);
        
        // Ensure exact size with sharp (plex might return aspect-ratio preserved image)
        const resizedBuffer = await sharp(buffer)
          .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
          .toBuffer();
          
        return {
          input: resizedBuffer,
          top: y,
          left: x,
          index: index
        };
      } catch (err) {
        logger.error({ err, itemId: item.ratingKey }, 'Failed to fetch image for atlas');
        return null; // Skip this image
      }
    });

    const results = await Promise.all(imagePromises);
    
    results.forEach((res, i) => {
      if (res) {
        compositeOps.push({ input: res.input, top: res.top, left: res.left });
        
        // Calculate UVs for Unity (0,0 is bottom-left)
        // Texture coordinates:
        // x = left / width
        // y = 1 - ((top + height) / height) -> 1 - (bottom / height)
        
        // Normalized dimensions
        const wNorm = THUMB_WIDTH / ATLAS_WIDTH;
        const hNorm = THUMB_HEIGHT / ATLAS_HEIGHT;
        
        const col = res.index % COLS;
        const row = Math.floor(res.index / COLS);
        
        const xNorm = (col * THUMB_WIDTH) / ATLAS_WIDTH;
        // Top in pixels is row * THUMB_HEIGHT.
        // Bottom in pixels is (row + 1) * THUMB_HEIGHT.
        // In Unity UV, y=0 is bottom. 
        // So y start (bottom of image) = 1 - (bottom_px / atlas_h)
        const yNorm = 1.0 - ((row + 1) * THUMB_HEIGHT) / ATLAS_HEIGHT;
        
        itemLayouts[res.index] = {
          uv: {
            x: xNorm,
            y: yNorm,
            w: wNorm,
            h: hNorm
          }
        };
      }
    });

    // Create blank canvas and composite
    const finalBuffer = await sharp({
      create: {
        width: ATLAS_WIDTH,
        height: ATLAS_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite(compositeOps)
    .jpeg({ quality: 80 })
    .toBuffer();

    return { buffer: finalBuffer, itemLayouts };
  }

  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  getAtlas(atlasId) {
    return this.atlases.get(atlasId);
  }
}

const createAtlasManager = (opts) => new AtlasManager(opts);

module.exports = { createAtlasManager };

