import { EQUIPMENT_CATALOG } from './equipment.js';
import { MAP_ITEMS } from '../world/world-locations.js';

const badge = (id, name, description, kind, target = 1) => Object.freeze({ id, name, description, kind, target });

export const TRAIL_BADGE_DEFINITIONS = Object.freeze([
  badge('field-naturalist-1', 'Field Naturalist I', 'Catch 50 unique active creatures.', 'uniqueCreatures', 50),
  badge('field-naturalist-2', 'Field Naturalist II', 'Catch 100 unique active creatures.', 'uniqueCreatures', 100),
  badge('field-naturalist-3', 'Field Naturalist III', 'Catch 200 unique active creatures.', 'uniqueCreatures', 200),
  badge('field-naturalist-4', 'Field Naturalist IV', 'Catch all 300 active creatures.', 'uniqueCreatures', 300),
  badge('seasoned-angler', 'Seasoned Angler', 'Land 100 legitimate catches.', 'totalCatches', 100),
  badge('thousand-casts', 'Thousand Catches', 'Land 1,000 legitimate catches.', 'totalCatches', 1000),
  badge('living-legend', 'Ten-Thousand Catches', 'Land 10,000 legitimate catches.', 'totalCatches', 10000),
  badge('market-naturalist', 'Market Naturalist', 'Sell 100 unique active creature species.', 'uniqueSold', 100),
  badge('complete-market-ledger', 'Complete Market Ledger', 'Sell every active creature species.', 'uniqueSold', 300),
  badge('curator-1', 'Curator I', 'Retain 25 creatures in the Aquarium.', 'aquarium', 25),
  badge('curator-2', 'Curator II', 'Retain 50 creatures in the Aquarium.', 'aquarium', 50),
  badge('curator-3', 'Curator III', 'Retain 100 creatures in the Aquarium.', 'aquarium', 100),
  badge('curator-4', 'Curator IV', 'Retain 150 creatures in the Aquarium.', 'aquarium', 150),
  badge('curator-5', 'Curator V', 'Retain 200 creatures in the Aquarium.', 'aquarium', 200),
  badge('curator-6', 'Curator VI', 'Retain 250 creatures in the Aquarium.', 'aquarium', 250),
  badge('grand-curator', 'Grand Curator', 'Retain 300 creatures in the Aquarium.', 'aquarium', 300),
  badge('biome-naturalist', 'Biome Naturalist', 'Land a legitimate catch in every current ecological biome.', 'biomes', 1),
  badge('water-explorer-1', 'Water Explorer I', 'Land a legitimate catch in 5 distinct water areas.', 'waters', 5),
  badge('water-explorer-2', 'Water Explorer II', 'Land a legitimate catch in 15 distinct water areas.', 'waters', 15),
  badge('water-explorer-3', 'Water Explorer III', 'Land a legitimate catch in every active water area.', 'waters', 1),
  badge('first-ascent', 'First Ascent', 'Reach the summit without a debug teleport.', 'summits', 1),
  badge('summit-regular', 'Summit Regular', 'Complete 5 legitimate summit ascents.', 'summits', 5),
  badge('peak-veteran', 'Peak Veteran', 'Complete 20 legitimate summit ascents.', 'summits', 20),
  badge('island-hopper', 'Island Hopper', 'Visit every current travel destination.', 'destinations', 1),
  badge('first-shiny', 'First Shiny', 'Catch your first legitimate Shiny creature.', 'shinies', 1),
  badge('shiny-hunter', 'Shiny Hunter', 'Catch 25 legitimate Shiny creatures.', 'shinies', 25),
  badge('legendary-encounter', 'Legendary Encounter', 'Catch your first legitimate Legendary creature.', 'legendary', 1),
  badge('full-kit', 'Full Kit', 'Own an upgraded item in every traversal equipment category.', 'fullKit', 1),
  badge('master-outfitter', 'Master Outfitter', 'Purchase every current gear and map item.', 'allPurchases', 1),
  badge('world-mapper', 'World Mapper', "Own the Master Naturalist's Atlas.", 'atlas', 1)
]);

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value)));

export class TrailBadgeSystem {
  constructor(saveSystem, progression, { activeSpecies = [], waters = [], biomes = [], destinations = [] } = {}) {
    this.saveSystem = saveSystem;
    this.progression = progression;
    this.activeSpeciesIds = new Set(activeSpecies.map((entry) => entry.canonicalId ?? entry.id));
    this.waterIds = new Set(waters.map((entry) => entry.id).filter(Boolean));
    this.biomeIds = new Set(biomes.filter(Boolean));
    this.destinationIds = new Set(destinations.map((entry) => entry.id).filter(Boolean));
    this.lastUnlocked = [];
    this.evaluate();
  }

  context() {
    const save = this.saveSystem.data;
    const progress = save.trailBadges ?? {};
    const activeCount = (items) => new Set((items ?? []).filter((id) => this.activeSpeciesIds.has(id))).size;
    const equipmentPurchases = EQUIPMENT_CATALOG.filter((item) => item.price > 0);
    const mapPurchases = MAP_ITEMS.filter((item) => item.price > 0);
    const ownedEquipment = new Set(save.progression?.ownedEquipment ?? []);
    const ownedItems = new Set(save.progression?.ownedItems ?? []);
    const traversalCategories = ['boots', 'gloves', 'climbingTool', 'chalk', 'harness'];
    const fullKitCount = traversalCategories.filter((category) => (
      equipmentPurchases.some((item) => item.category === category && ownedEquipment.has(item.id))
    )).length;
    const purchaseTotal = equipmentPurchases.length + mapPurchases.length;
    const purchaseCount = equipmentPurchases.filter((item) => ownedEquipment.has(item.id)).length
      + mapPurchases.filter((item) => ownedItems.has(item.id)).length;
    return {
      uniqueCreatures: activeCount(progress.uniqueSpeciesCaught),
      totalCatches: Number(save.lifetime?.fishCaught) || 0,
      uniqueSold: activeCount(progress.uniqueSpeciesSold),
      aquarium: save.progression?.aquarium?.length ?? 0,
      biomes: new Set((progress.biomesFished ?? []).filter((id) => this.biomeIds.has(id))).size,
      waters: new Set((progress.watersFished ?? []).filter((id) => this.waterIds.has(id))).size,
      summits: Number(save.lifetime?.summitCount) || 0,
      destinations: new Set((progress.destinationsVisited ?? []).filter((id) => this.destinationIds.has(id))).size,
      shinies: Number(save.lifetime?.shinyCaught) || 0,
      legendary: Number(save.lifetime?.catchesByRarity?.Legendary) || 0,
      fullKit: fullKitCount,
      allPurchases: purchaseCount,
      atlas: ownedEquipment.has('master-naturalist-atlas') ? 1 : 0,
      targets: {
        uniqueCreatures: this.activeSpeciesIds.size,
        uniqueSold: this.activeSpeciesIds.size,
        biomes: this.biomeIds.size,
        waters: this.waterIds.size,
        destinations: this.destinationIds.size,
        fullKit: traversalCategories.length,
        allPurchases: purchaseTotal,
        atlas: 1
      }
    };
  }

  resolvedTarget(definition, context) {
    if (definition.id === 'field-naturalist-4') return context.targets.uniqueCreatures;
    if (definition.id === 'complete-market-ledger') return context.targets.uniqueSold;
    if (definition.kind === 'biomes' || definition.kind === 'destinations'
      || definition.id === 'water-explorer-3' || ['fullKit', 'allPurchases', 'atlas'].includes(definition.kind)) {
      return context.targets[definition.kind];
    }
    return definition.target;
  }

  evaluate() {
    const context = this.context();
    const unlocked = new Set(this.saveSystem.data.trailBadges?.unlocked ?? []);
    const newlyUnlocked = [];
    for (const definition of TRAIL_BADGE_DEFINITIONS) {
      const target = this.resolvedTarget(definition, context);
      if ((context[definition.kind] ?? 0) >= target && !unlocked.has(definition.id)) newlyUnlocked.push(definition.id);
    }
    if (newlyUnlocked.length) this.saveSystem.unlockTrailBadges(newlyUnlocked);
    this.lastUnlocked = newlyUnlocked;
    return newlyUnlocked;
  }

  getViewModels() {
    this.evaluate();
    const context = this.context();
    const unlocked = new Set(this.saveSystem.data.trailBadges?.unlocked ?? []);
    return TRAIL_BADGE_DEFINITIONS.map((definition) => {
      const target = this.resolvedTarget(definition, context);
      const progress = Math.min(target, context[definition.kind] ?? 0);
      return Object.freeze({
        ...definition,
        target,
        progress,
        unlocked: unlocked.has(definition.id),
        progressLabel: `${formatNumber(progress)} / ${formatNumber(target)}`
      });
    });
  }
}
