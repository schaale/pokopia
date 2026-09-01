// Recipe tracker: lets you mark which item recipes you've actually unlocked in-game
// (crafting menu entries that aren't a "?" placeholder). Purely local to your browser —
// nothing here is shared game data, since recipe progress is per-player. Once an item is
// marked known, the Matcher can filter down to "craftable now" so you can tell at a
// glance which stored items are safe to break down for materials: if you can craft it
// again on demand, you don't need to hoard a spare.
const Recipes = (() => {
  const STORAGE_KEY = "pokopia.knownRecipes";

  let data = null;
  let known = new Set();
  let searchTerm = "";
  let onlyUnmarked = false;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      known = new Set(raw ? JSON.parse(raw) : []);
    } catch {
      known = new Set();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...known]));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — known list just won't persist
    }
  }

  function isKnown(id) {
    return known.has(id);
  }

  function knownCount() {
    return known.size;
  }

  function setKnown(id, val) {
    if (val) known.add(id); else known.delete(id);
    save();
  }

  function init(pokopiaData) {
    data = pokopiaData;
    load();
    const root = document.getElementById("view-recipes");
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>Craftable recipes <span class="sub">(what you've unlocked, not what exists)</span></h2>
          <p style="font-size:12.5px;color:var(--text-dim);line-height:1.6;margin-top:-4px">
            Check off items whose recipe you currently own — i.e. it shows a real thumbnail (not a "?") in your
            in-game crafting menu. Anything checked here can be filtered to in the Matcher, so you know it's safe
            to clear out of storage: you can always craft another. This list lives only in this browser
            (<span id="recipes-count"></span>).
          </p>
          <div class="poke-input-row" style="margin-top:var(--sp-3)">
            <input type="text" class="search-box" id="recipes-search" placeholder="Filter items by name…" style="flex:1">
            <button class="chip" id="recipes-hide-known">Hide checked</button>
            <button class="clear-all" id="recipes-clear">Clear all</button>
          </div>
          <details style="margin-top:var(--sp-3)">
            <summary style="cursor:pointer;font-size:12.5px;color:var(--text-dim);font-weight:700">Bulk import (paste item names, one per line or comma-separated)</summary>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:flex-start">
              <textarea id="recipes-import-text" rows="4" style="flex:1" placeholder="Storage box, Mini plain bed, Log table, ..."></textarea>
              <button class="chip" id="recipes-import-btn" style="white-space:nowrap">Mark as known</button>
            </div>
            <div id="recipes-import-result" style="font-size:12px;color:var(--text-dim);margin-top:6px"></div>
          </details>
        </div>

        <div class="rh">
          <h2>Items</h2>
          <span class="stats" id="recipes-stats"></span>
        </div>
        <div id="recipes-list"></div>
      </div>
    `;

    document.getElementById("recipes-search").addEventListener("input", (e) => {
      searchTerm = e.target.value.toLowerCase().trim();
      render();
    });
    document.getElementById("recipes-hide-known").addEventListener("click", (e) => {
      onlyUnmarked = !onlyUnmarked;
      e.target.classList.toggle("act", onlyUnmarked);
      render();
    });
    document.getElementById("recipes-clear").addEventListener("click", () => {
      if (!known.size) return;
      if (!confirm(`Clear all ${known.size} checked recipes?`)) return;
      known.clear();
      save();
      render();
    });
    document.getElementById("recipes-import-btn").addEventListener("click", () => {
      const raw = document.getElementById("recipes-import-text").value;
      const names = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      let matched = 0;
      const unmatched = [];
      names.forEach((name) => {
        const item = data.items.find((it) => it.name.toLowerCase() === name.toLowerCase());
        if (item) { known.add(item.id); matched++; }
        else unmatched.push(name);
      });
      save();
      document.getElementById("recipes-import-result").innerHTML = matched
        ? `Marked ${matched} item${matched === 1 ? "" : "s"} as known.` + (unmatched.length ? ` Not found: ${unmatched.map(esc).join(", ")}` : "")
        : `No matching item names found.` + (unmatched.length ? ` Unmatched: ${unmatched.map(esc).join(", ")}` : "");
      document.getElementById("recipes-import-text").value = "";
      render();
    });

    document.getElementById("recipes-list").addEventListener("change", (e) => {
      const row = e.target.closest("[data-item-id]");
      if (!row || !e.target.classList.contains("recipe-check")) return;
      const id = Number(row.dataset.itemId);
      setKnown(id, e.target.checked);
      row.classList.toggle("recipe-known", e.target.checked);
      updateStats();
    });

    render();
  }

  function updateStats() {
    document.getElementById("recipes-count").textContent = `${known.size} of ${data.items.length} marked known`;
    document.getElementById("recipes-stats").textContent = `${known.size} known`;
  }

  function render() {
    updateStats();
    const list = document.getElementById("recipes-list");
    let items = data.items;
    if (searchTerm) items = items.filter((it) => it.name.toLowerCase().includes(searchTerm));
    if (onlyUnmarked) items = items.filter((it) => !isKnown(it.id));
    items = [...items].sort((a, b) => a.name.localeCompare(b.name));

    if (!items.length) {
      list.innerHTML = '<div class="empty">No items match the current filters</div>';
      return;
    }

    list.innerHTML = `<div class="recipe-grid">` + items.map((it) => `
      <label class="recipe-row${isKnown(it.id) ? " recipe-known" : ""}" data-item-id="${it.id}">
        <input type="checkbox" class="recipe-check" ${isKnown(it.id) ? "checked" : ""}>
        <img class="item-thumb" src="data/images/${it.id}.png" alt="" loading="lazy" onerror="this.remove()">
        <span class="recipe-name">${esc(it.name)}</span>
      </label>
    `).join("") + `</div>`;
  }

  return { init, isKnown, knownCount };
})();
