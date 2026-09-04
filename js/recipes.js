// Recipe tracker: lets you mark which item recipes you've actually unlocked in-game
// (crafting menu entries that aren't a "?" placeholder). Purely local to your browser —
// nothing here is shared game data, since recipe progress is per-player. Once an item is
// marked known, the Matcher can filter down to "craftable now" so you can tell at a
// glance which stored items are safe to break down for materials: if you can craft it
// again on demand, you don't need to hoard a spare.
//
// The item list itself comes from CraftableItems (data/craftable-items.json), the full
// 860-recipe crafting menu in its actual in-game order — not PokopiaData.items, which is
// only the subset of items that carry Pokémon favorite tags and includes non-recipe stuff
// (materials, fossils, music tracks) that was never craftable to begin with.
const Recipes = (() => {
  const STORAGE_KEY = "pokopia.knownRecipes";

  // Recipes confirmed known (via crafting-menu screenshots cross-referenced against item
  // icons) as of this build. Baked in so a fresh browser/device starts already caught up
  // instead of everything reverting to "unknown" — the actual persistence fix, since
  // localStorage alone is per-browser. Extend this list (via the bulk-import box, then
  // copying its matched ids in) as more recipes get confirmed.
  const DEFAULT_KNOWN_IDS = [
    5, 24, 26, 32, 41, 55, 65, 71, 72, 76, 79, 80, 84, 87,
    88, 92, 94, 107, 112, 113, 116, 117, 119, 134, 139, 146, 151, 152,
    161, 176, 184, 185, 186, 187, 188, 189, 193, 200, 201, 203, 207, 214,
    215, 216, 217, 219, 229, 243, 247, 261, 263, 267, 269, 270, 272, 273,
    275, 277, 279, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291,
    292, 293, 296, 297, 298, 308, 313, 318, 324, 325, 326, 338, 339, 348,
    351, 352, 355, 359, 360, 361, 366, 367, 376, 378, 379, 382, 385, 398,
    399, 400, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422,
    423, 424, 425, 426, 427, 428, 437, 443, 447, 450, 451, 452, 453, 454,
    455, 457, 458, 470, 471, 478, 489, 492, 493, 494, 495, 496, 510, 518,
    519, 521, 535, 539, 543, 544, 560, 561, 566, 567, 568, 579, 581, 590,
    596, 598, 599, 602, 603, 604, 607, 611, 612, 614, 616, 618, 620, 621,
    622, 624, 625, 627, 647, 652, 655, 656, 667, 671, 677, 682, 686, 688,
    690, 703, 711, 712, 714, 715, 716, 717, 718, 721, 722, 731, 736, 739,
    742, 743, 745, 746, 747, 748, 750, 751, 752, 753, 755, 757, 758, 759,
    760, 761, 762, 765, 766, 767, 768, 769, 770, 772, 773, 777, 778, 780,
    781, 783, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796,
    797, 798, 799, 800, 805, 806, 808, 809, 810, 813, 817, 818, 820, 821,
    822, 823, 824, 825, 827, 828, 829, 833, 834, 835, 838, 839, 840, 844,
    846, 847, 848, 850, 851, 852, 857, 858, 859, 860, 861, 864, 873, 883,
    884, 885, 886, 887, 888, 899, 900, 902, 906, 910, 911, 913, 914, 915,
    916, 918, 920, 924, 926, 928, 929, 930, 931, 932, 933, 935, 939, 940,
    944, 952, 958, 959, 973, 1007, 1019, 1023, 1029, 1050, 1058, 1059, 1061, 1062,
    1070, 1073,
  ];

  let craftable = [];
  let known = new Set();
  let searchTerm = "";
  let onlyUnmarked = false;
  let sortMode = "default"; // 'default' (game crafting-menu order) | 'az'

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
    DEFAULT_KNOWN_IDS.forEach((id) => known.add(id));
    save();
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

  function init(pokopiaData, craftableItems) {
    craftable = craftableItems;
    load();
    const root = document.getElementById("view-recipes");
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>Craftable recipes <span class="sub">(what you've unlocked, not what exists)</span></h2>
          <p style="font-size:12.5px;color:var(--text-dim);line-height:1.6;margin-top:-4px">
            Click an item whose recipe you currently own — i.e. it shows a real thumbnail (not a "?") in your
            in-game crafting menu — to mark it green. Anything green can be filtered to in the Matcher, so you know
            it's safe to clear out of storage: you can always craft another. A baseline of confirmed recipes ships
            with the app itself, so it's the same on every device; anything you mark beyond that is saved to this
            browser only (<span id="recipes-count"></span>). "Default" order matches the crafting menu's own
            tab-by-tab, row-by-row layout, so you can scan it side by side with the game.
          </p>
          <div class="poke-input-row" style="margin-top:var(--sp-3)">
            <input type="text" class="search-box" id="recipes-search" placeholder="Filter items by name…" style="flex:1">
            <button class="chip" id="recipes-hide-known">Hide checked</button>
            <button class="clear-all" id="recipes-clear">Clear all</button>
          </div>
          <div class="mode-row">
            <span class="lbl">Sort:</span>
            <button class="chip act" data-sort="default">Default</button>
            <button class="chip" data-sort="az">A-Z</button>
          </div>
          <details style="margin-top:var(--sp-3)">
            <summary style="cursor:pointer;font-size:12.5px;color:var(--text-dim);font-weight:700">Bulk import (paste item names, one per line or comma-separated)</summary>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:flex-start">
              <textarea id="recipes-import-text" rows="4" style="flex:1" placeholder="Storage box, Mini plain bed, Log table, ..."></textarea>
              <button class="chip" id="recipes-import-btn" style="white-space:nowrap">Mark as known</button>
            </div>
            <div id="recipes-import-result" style="font-size:12px;color:var(--text-dim);margin-top:6px"></div>
          </details>
          <details id="recipes-export-details" style="margin-top:var(--sp-2)">
            <summary style="cursor:pointer;font-size:12.5px;color:var(--text-dim);font-weight:700">Export items checked since the last update <span id="recipes-export-count"></span></summary>
            <p style="font-size:12px;color:var(--text-dim);margin-top:8px">Paste this back to report which recipes you've unlocked since the built-in baseline was last refreshed.</p>
            <div style="display:flex;gap:8px;margin-top:6px;align-items:flex-start">
              <textarea id="recipes-export-text" rows="4" style="flex:1" readonly></textarea>
              <button class="chip" id="recipes-export-copy-btn" style="white-space:nowrap">Copy</button>
            </div>
            <div id="recipes-export-result" style="font-size:12px;color:var(--text-dim);margin-top:6px"></div>
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
    document.querySelectorAll(".mode-row .chip[data-sort]").forEach((chip) => {
      chip.onclick = () => {
        sortMode = chip.dataset.sort;
        document.querySelectorAll(".mode-row .chip[data-sort]").forEach((c) => c.classList.toggle("act", c.dataset.sort === sortMode));
        render();
      };
    });
    document.getElementById("recipes-import-btn").addEventListener("click", () => {
      const raw = document.getElementById("recipes-import-text").value;
      const names = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      let matched = 0;
      const unmatched = [];
      names.forEach((name) => {
        const item = craftable.find((it) => it.name.toLowerCase() === name.toLowerCase());
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

    document.getElementById("recipes-export-copy-btn").addEventListener("click", async () => {
      const text = document.getElementById("recipes-export-text").value;
      const resultEl = document.getElementById("recipes-export-result");
      if (!text) { resultEl.textContent = "Nothing to copy — no new recipes checked since the baseline."; return; }
      try {
        await navigator.clipboard.writeText(text);
        resultEl.textContent = "Copied to clipboard.";
      } catch {
        resultEl.textContent = "Couldn't access the clipboard — select the text above and copy it manually.";
      }
    });

    document.getElementById("recipes-list").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!e.target.closest("[data-item-id]")) return;
      e.preventDefault();
      e.target.click();
    });
    document.getElementById("recipes-list").addEventListener("click", (e) => {
      const row = e.target.closest("[data-item-id]");
      if (!row) return;
      const id = Number(row.dataset.itemId);
      const nowKnown = !isKnown(id);
      setKnown(id, nowKnown);
      updateStats();
      updateExportBox();
      // "Hide checked" is active and this item just became checked — it should drop out
      // of view rather than sit there contradicting the filter.
      if (onlyUnmarked && nowKnown) {
        row.remove();
        if (!document.querySelector("#recipes-list .recipe-row")) render();
        return;
      }
      row.classList.toggle("recipe-known", nowKnown);
      const item = craftable.find((it) => it.id === id);
      const nameEl = row.querySelector(".recipe-name");
      nameEl.textContent = nowKnown ? item.name : "?";
      nameEl.classList.toggle("recipe-name-hidden", !nowKnown);
      row.querySelector(".recipe-thumb").innerHTML = thumbHtml(item, nowKnown);
    });

    render();
  }

  // Items checked beyond the baked-in DEFAULT_KNOWN_IDS baseline — i.e. recipes you've
  // confirmed since the app was last updated with your screenshots.
  function newlySinceBaseline() {
    const baseline = new Set(DEFAULT_KNOWN_IDS);
    return craftable
      .filter((it) => known.has(it.id) && !baseline.has(it.id))
      .sort((a, b) => a.order - b.order);
  }

  function updateExportBox() {
    const items = newlySinceBaseline();
    document.getElementById("recipes-export-count").textContent = items.length ? `(${items.length})` : "";
    document.getElementById("recipes-export-text").value = items.map((it) => it.name).join(", ");
  }

  function updateStats() {
    document.getElementById("recipes-count").textContent = `${known.size} of ${craftable.length} marked known`;
    document.getElementById("recipes-stats").textContent = `${known.size} known`;
  }

  // Unchecked = a recipe you haven't confirmed yet — don't even request the real thumbnail,
  // so scrolling the full list can't spoil an item you haven't unlocked in-game. The
  // placeholder mirrors the crafting menu's own locked "?" tiles.
  function thumbHtml(it, known) {
    return known
      ? `<img class="item-thumb" src="data/images/${it.id}.png" alt="" loading="lazy" onerror="this.remove()">`
      : `<span class="item-thumb recipe-thumb-placeholder">?</span>`;
  }

  function render() {
    updateStats();
    updateExportBox();
    const list = document.getElementById("recipes-list");
    let items = craftable;
    if (searchTerm) items = items.filter((it) => it.name.toLowerCase().includes(searchTerm));
    if (onlyUnmarked) items = items.filter((it) => !isKnown(it.id));
    items = [...items].sort(sortMode === "az"
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => a.order - b.order);

    if (!items.length) {
      list.innerHTML = '<div class="empty">No items match the current filters</div>';
      return;
    }

    list.innerHTML = `<div class="recipe-grid">` + items.map((it) => {
      const known = isKnown(it.id);
      const name = known ? esc(it.name) : "?";
      return `
      <div class="recipe-row${known ? " recipe-known" : ""}" data-item-id="${it.id}" role="button" tabindex="0">
        <span class="recipe-thumb">${thumbHtml(it, known)}</span>
        <span class="recipe-name${known ? "" : " recipe-name-hidden"}">${name}</span>
      </div>
    `;
    }).join("") + `</div>`;
  }

  return { init, isKnown, knownCount };
})();
