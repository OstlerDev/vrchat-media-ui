
class SlotManager {
  constructor({ maxSlots = 1000 } = {}) {
    this.maxSlots = maxSlots;
    this.plexToSlot = new Map();
    this.slotToPlex = new Map();
    this.nextSlot = 0;
  }

  assignSlot(plexId) {
    // Ensure plexId is a string or consistent type
    const pid = String(plexId);

    // If already assigned, return existing slot
    if (this.plexToSlot.has(pid)) {
      return this.plexToSlot.get(pid);
    }

    // Assign new slot
    const slotId = this.nextSlot;
    
    // Update next slot (rolling)
    this.nextSlot = (this.nextSlot + 1) % this.maxSlots;

    // Clean up old assignment at this slot if any
    if (this.slotToPlex.has(slotId)) {
      const oldPlexId = this.slotToPlex.get(slotId);
      this.plexToSlot.delete(oldPlexId);
    }

    // Store new mapping
    this.slotToPlex.set(slotId, pid);
    this.plexToSlot.set(pid, slotId);

    return slotId;
  }

  getPlexId(slotId) {
    const id = parseInt(slotId, 10);
    return this.slotToPlex.get(id);
  }
}

const createSlotManager = (opts) => new SlotManager(opts);

module.exports = { createSlotManager };

