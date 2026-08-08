// Loads the shared Pokopia dataset once and exposes it as a promise.
// Shape: { meta, categories: [string], habitats: [string],
//          items: [{id,name,description,tags,type}],
//          pokemon: [{id,name,favorites,habitat}] }
const PokopiaData = fetch("data/pokopia-data.json").then((r) => {
  if (!r.ok) throw new Error("Failed to load data/pokopia-data.json (" + r.status + ")");
  return r.json();
});
