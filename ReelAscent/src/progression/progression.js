import { getCatchValue } from './economy.js';
import { EquipmentManager } from './equipment.js';
import { removeAquariumSpecimen, storeAquariumSpecimen } from './aquarium.js';
import { createSpecimenRecord, findSpecimenIndex } from './inventory.js';
import { normalizeProgressionState } from './progression-save.js';
import { serializeProgress, validateProgressImport } from './progress-transfer.js';
import { normalizeAppearance } from '../player/appearance.js';
import { MAP_ITEM_BY_ID } from '../world/world-locations.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

export class ProgressionSystem {
  constructor(saveSystem) {
    this.saveSystem = saveSystem;
    this.state = normalizeProgressionState(saveSystem.data.progression);
    this.saveSystem.data.progression = this.state;
    this.revision = 0;
    this.equipment = new EquipmentManager(() => this.state, () => this.commit(), {
      canAfford: (price) => this.canAfford(price),
      spend: (price) => this.spend(price)
    });
    this.equipment.repairDefaults();
  }

  commit() {
    this.saveSystem.data.progression = this.state;
    this.saveSystem.save();
    this.revision += 1;
  }

  canAfford(price) {
    return this.state.money >= Math.max(0, Number(price) || 0);
  }

  spend(price) {
    const amount = Math.max(0, Math.floor(Number(price) || 0));
    if (!this.canAfford(amount)) return false;
    this.state.money -= amount;
    return true;
  }

  addMoney(amount) {
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta) return this.state.money;
    this.state.money += delta;
    this.commit();
    return this.state.money;
  }

  captureCatch(catchData) {
    if (!catchData?.speciesId) return { ok: false, specimen: null, value: null, reason: 'Invalid catch' };
    const value = getCatchValue(catchData);
    const specimen = createSpecimenRecord(catchData, value, this.state.player.id);
    if (this.state.inventory.some((entry) => entry.specimenId === specimen.specimenId)) {
      return { ok: false, specimen, value, reason: 'Catch already stored' };
    }
    this.state.inventory.push(specimen);
    this.commit();
    return { ok: true, specimen, value };
  }

  sellInventorySpecimen(specimenId) {
    const index = findSpecimenIndex(this.state.inventory, specimenId);
    if (index < 0) return { ok: false, reason: 'Specimen not found in Inventory' };
    const [specimen] = this.state.inventory.splice(index, 1);
    if (this.state.heldSpecimenId === specimenId) this.state.heldSpecimenId = null;
    this.state.money += specimen.value;
    this.commit();
    return { ok: true, specimen, amount: specimen.value };
  }

  moveInventorySpecimenToAquarium(specimenId) {
    const index = findSpecimenIndex(this.state.inventory, specimenId);
    if (index < 0) return { ok: false, reason: 'Specimen not found in Inventory' };
    const specimen = this.state.inventory[index];
    const prepared = { specimen, value: specimen.value };
    if (!storeAquariumSpecimen(this.state.aquarium, prepared)) {
      return { ok: false, reason: 'Specimen already stored in Aquarium' };
    }
    this.state.inventory.splice(index, 1);
    if (this.state.heldSpecimenId === specimenId) this.state.heldSpecimenId = null;
    this.commit();
    return { ok: true, specimen, amount: 0 };
  }

  moveAquariumSpecimenToInventory(specimenId) {
    const specimen = removeAquariumSpecimen(this.state.aquarium, specimenId);
    if (!specimen) return { ok: false, reason: 'Specimen not found in Aquarium' };
    if (this.state.inventory.some((entry) => entry.specimenId === specimen.specimenId)) {
      this.state.aquarium.push(specimen);
      return { ok: false, reason: 'Specimen is already in Inventory' };
    }
    this.state.inventory.push(specimen);
    this.commit();
    return { ok: true, specimen };
  }

  // Backwards-compatible debug helper: prefer selling Inventory specimens, but old automation
  // that passes an Aquarium specimen ID still works.
  sellSpecimen(specimenId) {
    if (findSpecimenIndex(this.state.inventory, specimenId) >= 0) return this.sellInventorySpecimen(specimenId);
    const specimen = removeAquariumSpecimen(this.state.aquarium, specimenId);
    if (!specimen) return { ok: false, reason: 'Specimen not found' };
    this.state.money += specimen.value;
    this.commit();
    return { ok: true, specimen, amount: specimen.value };
  }

  purchase(itemId) { return this.equipment.purchase(itemId); }
  equip(itemId) { return this.equipment.equip(itemId); }
  getModifier(name) { return this.equipment.getModifier(name); }
  getModifiers() { return this.equipment.getModifiers(); }
  getEquippedItem(category) { return this.equipment.getEquippedItem(category); }

  purchaseWorldItem(itemId) {
    const item = MAP_ITEM_BY_ID.get(itemId);
    if (!item) return { ok: false, reason: 'Unknown shop item' };
    if (this.state.ownedItems.includes(item.id)) return { ok: false, reason: `${item.name} already owned` };
    if (!this.spend(item.price)) return { ok: false, reason: `Need $${item.price}` };
    this.state.ownedItems.push(item.id);
    this.commit();
    return { ok: true, item };
  }

  ownsWorldItem(itemId) {
    return this.state.ownedItems.includes(itemId);
  }

  setHeldWorldItem(itemId = null) {
    if (itemId === null) {
      this.state.heldItemId = null;
      this.commit();
      return { ok: true, item: null };
    }
    const item = MAP_ITEM_BY_ID.get(itemId);
    if (!item || !this.ownsWorldItem(itemId)) return { ok: false, reason: 'Item not owned' };
    if (itemId === this.state.heldItemId) return { ok: true, item };
    this.state.heldItemId = itemId;
    this.state.heldSpecimenId = null;
    this.commit();
    return { ok: true, item };
  }

  getAppearance() {
    return normalizeAppearance(this.state.appearance);
  }

  getHeldInventorySpecimen() {
    return this.state.inventory.find((entry) => entry.specimenId === this.state.heldSpecimenId) ?? null;
  }

  setHeldInventorySpecimen(specimenId = null) {
    if (specimenId === null || specimenId === this.state.heldSpecimenId) {
      if (this.state.heldSpecimenId === null) return { ok: true, specimen: null };
      this.state.heldSpecimenId = null;
      this.commit();
      return { ok: true, specimen: null };
    }
    const specimen = this.state.inventory.find((entry) => entry.specimenId === specimenId);
    if (!specimen) return { ok: false, specimen: null, reason: 'Specimen not found in Inventory' };
    this.state.heldSpecimenId = specimen.specimenId;
    this.state.heldItemId = null;
    this.commit();
    return { ok: true, specimen };
  }

  setAppearance(value) {
    const next = normalizeAppearance({ ...this.state.appearance, ...value });
    const changed = Object.keys(next).some((key) => next[key] !== this.state.appearance?.[key]);
    if (!changed) return this.getAppearance();
    this.state.appearance = next;
    this.commit();
    return this.getAppearance();
  }

  getSnapshot() {
    const snapshot = copy(this.state);
    // Preserve the old read-only alias for external debug tooling; owned undecided catches now
    // live in inventory and Aquarium is explicitly chosen storage.
    snapshot.specimens = snapshot.aquarium;
    return snapshot;
  }

  getHudState() {
    return {
      money: this.state.money,
      specimenCount: this.state.inventory.length,
      aquariumCount: this.state.aquarium.length,
      itemCount: this.state.ownedItems.length,
      equipped: { ...this.state.equipped }
    };
  }

  exportProgress() {
    return serializeProgress(this.saveSystem.getSnapshot());
  }

  previewProgressImport(input) {
    return validateProgressImport(input);
  }

  importProgress(input) {
    const result = validateProgressImport(input);
    if (!this.saveSystem.replaceData(result.save)) {
      throw new Error('Progress was valid, but this browser could not save it. Your current progress was kept.');
    }
    this.state = normalizeProgressionState(this.saveSystem.data.progression);
    this.saveSystem.data.progression = this.state;
    this.equipment.repairDefaults();
    this.revision += 1;
    return result.summary;
  }

  importProgressToSlot(input, slotId) {
    const result = validateProgressImport(input);
    if (!this.saveSystem.replaceSlotData(slotId, result.save)) {
      throw new Error('Progress was valid, but the destination slot could not be saved.');
    }
    return result.summary;
  }
}
