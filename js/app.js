document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = Icons.get(el.dataset.icon);
});

document.querySelectorAll("#page-tabs .page-tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll("#page-tabs .page-tab").forEach((t) => t.classList.toggle("act", t === tab));
    document.querySelectorAll("main .page-view").forEach((v) => v.classList.remove("act"));
    document.getElementById("view-" + tab.dataset.view).classList.add("act");
  };
});

Promise.all([PokopiaData, CraftableItems]).then(([data, craftable]) => {
  Recipes.init(data, craftable);
  Matcher.init(data);
  Cohabitants.init(data);
  Optimizer.init(data);

  const meta = document.getElementById("data-meta");
  meta.innerHTML = `Data: ${data.pokemon.length} Pokémon · ${data.items.length} items · ${data.categories.length} preference categories &mdash; as of ${data.meta.sourceDate}. `
    + `<a href="https://github.com/schaale/pokopia" target="_blank" rel="noopener">Source</a>`;
}).catch((err) => {
  document.getElementById("data-meta").textContent = "Failed to load data: " + err.message;
  console.error(err);
});
