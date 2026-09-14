// Developer-only inventory for the planned manual item-by-item value review.
// Run: node scripts/shop-audit.mjs > shop-audit.csv
import { EQUIPMENT_CATALOG } from '../src/progression/equipment.js';
import { SHOP_COSMETICS } from '../src/progression/cosmetics.js';
import { MAP_ITEMS } from '../src/world/world-locations.js';

const rows = [
  ...EQUIPMENT_CATALOG.map((item) => ({
    id: item.id, name: item.name, category: item.category, price: item.price,
    unlock: item.price ? 'Outfitter purchase' : 'Starter',
    effect: JSON.stringify(item.modifiers ?? {}), description: item.effect
  })),
  ...MAP_ITEMS.map((item) => ({
    id: item.id, name: item.name ?? item.label, category: 'map', price: item.price,
    unlock: 'Outfitter purchase', effect: item.mode ?? item.id,
    description: item.description ?? item.effect ?? ''
  })),
  ...SHOP_COSMETICS.map((item) => ({
    id: item.id, name: item.label, category: `cosmetic:${item.slot}`,
    price: item.source.price, unlock: item.source.hint,
    effect: `Appearance: ${item.visual}`, description: item.source.hint
  }))
];
const fields = ['id', 'name', 'category', 'price', 'unlock', 'effect', 'description'];
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
console.log(fields.map(csv).join(','));
for (const row of rows) console.log(fields.map((field) => csv(row[field])).join(','));
