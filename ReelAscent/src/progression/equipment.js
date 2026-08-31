import { DEFAULT_EQUIPPED } from './progression-save.js';

const item = (id, category, name, price, effect, modifiers = {}, metadata = {}) => Object.freeze({
  id, category, name, price, effect,
  modifiers: Object.freeze({ ...modifiers }),
  ...metadata
});

export const EQUIPMENT_CATALOG = Object.freeze([
  item('trail-rod', 'rod', 'Trail Rod', 0, 'Balanced starter rod.'),
  item('precision-tip-rod', 'rod', 'Precision Tip Rod', 1500, '12% wider successful timing window; PERFECT stays precise.', { successWindowMultiplier: 1.12 }),
  item('virtuoso-rod', 'rod', 'Virtuoso Rod', 6000, '11% faster songs; any landed catch is at least GREAT.', { tempoMultiplier: 1.11, minimumSuccessfulQuality: 'GREAT' }),

  item('creek-reel', 'reel', 'Creek Reel', 0, 'Balanced starter reel.'),
  item('quickbeat-reel', 'reel', 'Quickbeat Reel', 2500, '20% wider successful window, but songs play 14% faster.', { successWindowMultiplier: 1.2, tempoMultiplier: 1.14 }),
  item('stillpoint-reel', 'reel', 'Stillpoint Reel', 2500, 'Songs play 14% slower, but the successful window is 18% narrower.', { successWindowMultiplier: .82, tempoMultiplier: .86 }),

  item('standard-line', 'line', 'Standard Line', 0, 'Dependable starter line.'),
  item('shock-absorb-line', 'line', 'Shock-Absorb Line', 1500, 'Ordinary creatures allow roughly 50% more mistakes.', { mistakeAllowanceMultiplier: 1.5 }),
  item('trophy-braid', 'line', 'Trophy Braid', 3500, 'Moderately shifts specimen length and body-size rolls upward.', { specimenSizeBias: .12 }),
  item('braided-lifeline', 'line', 'Braided Lifeline', 7500, 'Ordinary creatures allow roughly twice as many mistakes.', { mistakeAllowanceMultiplier: 2 }),

  item('plain-spoon', 'lure', 'Plain Spoon', 0, 'Simple starter tackle.'),
  item('fast-bite-chum', 'lure', 'Fast-Bite Chum', 1250, 'Cuts average bite waiting time in half.', { biteDelayMultiplier: .5 }),
  item('silverflash-spoon', 'lure', 'Silverflash Spoon', 2000, 'Multiplies Rare odds by 1.5 at the rarity-choice layer.', { rareWeightMultiplier: 1.5 }),
  item('oddity-bait', 'lure', 'Oddity Bait', 3000, 'Doubles eligible non-fish creature odds within the chosen rarity.', { nonFishWeightMultiplier: 2 }),
  item('mythlight-lure', 'lure', 'Mythlight Lure', 10000, 'Multiplies Legendary odds by 1.78 at the rarity-choice layer.', { legendaryWeightMultiplier: 1.78 }),
  item('prism-lure', 'lure', 'Prism Lure', 10000, 'Doubles Shiny odds, but songs play 9% faster.', { shinyChanceMultiplier: 2, tempoMultiplier: 1.09 }),

  item('common-field-notes', 'guide', 'Common Field Notes', 400, 'Shows the five likeliest Common creatures nearby.', {}, { guideMode: 'rarity', guideRarity: 'Common' }),
  item('uncommon-field-notes', 'guide', 'Uncommon Field Notes', 800, 'Shows the five likeliest Uncommon creatures nearby.', {}, { guideMode: 'rarity', guideRarity: 'Uncommon' }),
  item('rare-field-notes', 'guide', 'Rare Field Notes', 2000, 'Shows the five likeliest Rare creatures nearby.', {}, { guideMode: 'rarity', guideRarity: 'Rare' }),
  item('legendary-field-notes', 'guide', 'Legendary Field Notes', 5000, 'Shows the five likeliest Legendary creatures nearby.', {}, { guideMode: 'rarity', guideRarity: 'Legendary' }),
  item('local-secrets-guide', 'guide', 'Local Secrets Guide', 3500, 'Shows every location-exclusive creature and its live chance.', {}, { guideMode: 'exclusive' }),
  item('master-naturalist-atlas', 'guide', "Master Naturalist's Atlas", 20000, 'Shows each rarity’s top five plus all location exclusives.', {}, { guideMode: 'atlas' }),

  item('trail-boots', 'boots', 'Trail Boots', 0, 'Balanced starter boots.'),
  item('trail-gloves', 'gloves', 'Trail Gloves', 0, 'Balanced starter gloves.'),
  item('trail-kit', 'climbingTool', 'Trail Kit', 0, 'Standard climbing tool with no traversal bonus.'),
  item('empty-chalk-loop', 'chalk', 'Empty Chalk Loop', 0, 'Starter belt loop with no stamina bonus.'),
  item('trail-harness', 'harness', 'Trail Harness', 0, 'Balanced starter harness and pack.'),
  item('trail-runners', 'boots', 'Trail Runners', 1250, 'Sprint speed increases by 15%.', { sprintSpeedMultiplier: 1.15 }),
  // Keep the durable id so existing saves migrate cleanly, but this is the v9 replacement item.
  item('endurance-belt', 'boots', 'Endurance Boots', 1750, 'Normal sprinting consumes no stamina.', { sprintDrain: 0 }),
  item('chalk-gloves', 'gloves', 'Climbing Gloves', 2000, 'Climbing and grip stamina costs decrease by 20%.', { gripDrain: .8 }),
  item('climber-chalk', 'chalk', 'Chalk Bag', 5000, 'Climbing and grip stamina costs decrease by 30%.', { gripDrain: .7 }),
  item('ice-axe', 'climbingTool', 'Ice Axe', 8500, 'Uses the Hand slot. On ice and smooth slippery rock: 25% less climb/grip stamina, reduced slip, and better slide stability.', { iceClimbCostMultiplier: .75, iceSlipMultiplier: .55, iceSlideThresholdMultiplier: 1.08 }, { usesHand: true }),
  item('alpine-harness', 'harness', 'Alpine Harness', 3500, 'Climbing and grip stamina costs decrease by 20%.', { climbCostMultiplier: .8 }),
  item('springstep-boots', 'boots', 'Springstep Boots', 4000, 'Jump impulse increases by 25%.', { jumpImpulseMultiplier: 1.25 }),
  item('summit-vault-boots', 'boots', 'Summit Vault Boots', 12000, 'Jump impulse increases by 50%.', { jumpImpulseMultiplier: 1.5 }),
  item('ultralight-kit', 'harness', 'Ultralight Harness', 10000, 'All normal traversal stamina costs use a centralized 0.60 multiplier.', { staminaCostMultiplier: .6 })
]);

export const EQUIPMENT_BY_ID = new Map(EQUIPMENT_CATALOG.map((entry) => [entry.id, entry]));
const QUALITY_RANK = Object.freeze({ GOOD: 1, GREAT: 2, PERFECT: 3 });

export class EquipmentManager {
  constructor(getState, commit, economy = {}) {
    this.getState = getState;
    this.commit = commit;
    this.canAfford = economy.canAfford ?? ((price) => this.getState().money >= price);
    this.spend = economy.spend ?? ((price) => { this.getState().money -= price; return true; });
  }

  getModifiers() {
    const result = {};
    const state = this.getState();
    for (const itemId of Object.values(state.equipped)) {
      const equippedItem = EQUIPMENT_BY_ID.get(itemId);
      if (equippedItem?.usesHand && state.heldItemId !== itemId) continue;
      const modifiers = equippedItem?.modifiers ?? {};
      for (const [name, value] of Object.entries(modifiers)) {
        if (name === 'minimumSuccessfulQuality') {
          if ((QUALITY_RANK[value] ?? 0) > (QUALITY_RANK[result[name]] ?? 0)) result[name] = value;
        } else if (Number.isFinite(value)) result[name] = (result[name] ?? 1) * Math.max(0, value);
      }
    }
    return Object.freeze(result);
  }

  getModifier(name) {
    return this.getModifiers()[name] ?? 1;
  }

  getEquippedItem(category) {
    return EQUIPMENT_BY_ID.get(this.getState().equipped[category]) ?? null;
  }

  purchase(itemId) {
    const state = this.getState();
    const selected = EQUIPMENT_BY_ID.get(itemId);
    if (!selected) return { ok: false, reason: 'Unknown item' };
    if (state.ownedEquipment.includes(itemId)) return { ok: false, reason: 'Already owned' };
    if (!this.canAfford(selected.price)) return { ok: false, reason: 'Not enough money' };
    if (!this.spend(selected.price)) return { ok: false, reason: 'Not enough money' };
    state.ownedEquipment.push(itemId);
    this.commit();
    return { ok: true, item: selected };
  }

  equip(itemId) {
    const state = this.getState();
    const selected = EQUIPMENT_BY_ID.get(itemId);
    if (!selected || !state.ownedEquipment.includes(itemId)) return { ok: false, reason: 'Item not owned' };
    const previous = EQUIPMENT_BY_ID.get(state.equipped[selected.category]);
    state.equipped[selected.category] = itemId;
    if (previous?.usesHand && state.heldItemId === previous.id) state.heldItemId = null;
    if (selected.usesHand) {
      state.heldItemId = selected.id;
      state.heldSpecimenId = null;
    }
    this.commit();
    return { ok: true, item: selected };
  }

  repairDefaults() {
    const state = this.getState();
    for (const [category, itemId] of Object.entries(DEFAULT_EQUIPPED)) {
      const equipped = EQUIPMENT_BY_ID.get(state.equipped[category]);
      if (!equipped || equipped.category !== category) state.equipped[category] = itemId;
    }
    if (state.equipped.guide && !EQUIPMENT_BY_ID.has(state.equipped.guide)) delete state.equipped.guide;
  }
}
