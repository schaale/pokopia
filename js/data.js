// Loads the shared Pokopia dataset once and exposes it as a promise.
// Shape: { meta, categories: [string], habitats: [string],
//          items: [{id,name,description,tags,type}],
//          pokemon: [{id,name,favorites,habitat}] }
const PokopiaData = fetch("data/pokopia-data.json").then((r) => {
  if (!r.ok) throw new Error("Failed to load data/pokopia-data.json (" + r.status + ")");
  return r.json();
});

// The full in-game crafting list (every recipe, in the same order the crafting menu shows
// them — grouped by tab, then by grid position within that tab), cross-referenced from a
// Game8 guide against our item icons. Superset of PokopiaData.items: most items here reuse
// an id from there (favorite tags + image), but ~450 have no Pokémon favorites at all —
// mostly structural/utility pieces the Serebii-favorites crawl behind pokopia-data.json
// never picked up — so they only carry a name/category/order here.
// Shape: [{id, name, category, order}]
const CraftableItems = fetch("data/craftable-items.json").then((r) => {
  if (!r.ok) throw new Error("Failed to load data/craftable-items.json (" + r.status + ")");
  return r.json();
});
