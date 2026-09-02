// Favorites Matcher: pick Pokémon, see which items appeal to them, one horizontally
// scrolling carousel per item type (Decor / Relaxation / Toy / Other) so the page stays
// short regardless of how many items match.
const Matcher = (() => {
  // Per-Pokémon categorical colors, darkened from their original vivid hues so each
  // still passes WCAG AA (>=4.5:1) as text on the app's light cream background.
  const COLORS = ["#d53541","#2c7d8d","#974cde","#17853f","#ba5610","#c83d82","#0e8275","#916e04",
    "#6062e9","#d23b3b","#0a7bae","#8256e7","#d43651","#047f94","#b63ac8","#53800d",
    "#a86128","#b25384","#1b8174","#916e14","#636bbe","#b75261","#247aa1","#8a5fb5"];

  const HABITAT_OPPOSITE = { Bright: "Dark", Dark: "Bright", Warm: "Cool", Cool: "Warm", Humid: "Dry", Dry: "Humid" };
  const AXIS_OF = { Bright: "light", Dark: "light", Warm: "temp", Cool: "temp", Humid: "moist", Dry: "moist" };

  const ROWS = [
    { type: "decor", icon: "decor", label: "Decor" },
    { type: "relaxation", icon: "relaxation", label: "Relaxation" },
    { type: "toy", icon: "toy", label: "Toy" },
    { type: "other", icon: "box", label: "Other" }, // road / none / other — still carry real preference tags
  ];

  let data = null;
  const selected = []; // [{name, favorites, habitat}]
  let mode = "shared"; // 'all' | 'shared' — default to "Appeals to all"
  let craftableOnly = false; // when true, limit results to items whose recipe is marked known in Recipes
  let mobileTypeFilter = "all"; // mobile-only: narrows the stacked list to one row type
  let highlightIdx = -1;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function habitatBadge(habitat) {
    return `<span class="env-badge badge-${habitat.toLowerCase()}" style="font-size:10px">${Icons.habitat(habitat)} ${habitat}</span>`;
  }

  function columnFor(item) {
    const t = item.type;
    return t === "decor" || t === "relaxation" || t === "toy" ? t : "other";
  }

  function init(pokopiaData) {
    data = pokopiaData;
    const root = document.getElementById("view-matcher");
    root.innerHTML = `
      <div class="container">
        <div class="card poke-section">
          <h2>Pokémon <span class="sub">(type to search, click to add)</span></h2>
          <div class="selected-pokemon" id="selected-pokemon"></div>
          <div id="habitat-summary"></div>
          <div class="poke-input-row">
            <div class="poke-search" id="poke-search">
              <input type="text" id="poke-input" placeholder="Type a Pokémon name…" autocomplete="off">
              <div class="dropdown" id="poke-dropdown"></div>
            </div>
            <button class="clear-all" id="clear-all">Clear all</button>
          </div>
        </div>

        <div id="matcher-controls" style="display:none">
          <input type="text" class="search-box" id="item-search" placeholder="Filter items by name…">

          <div class="mode-row">
            <span class="lbl">Show:</span>
            <button class="chip" data-m="all">All matches</button>
            <button class="chip act" data-m="shared">Appeals to all</button>
          </div>

          <div class="mode-row">
            <span class="lbl">Storage cleanup:</span>
            <button class="chip" id="craftable-only-toggle" title="Only show items whose recipe you've marked known on the Recipes tab — a hoarding hint: if you can craft it again, you don't need to keep a spare.">${Icons.get("box")} Craftable only <span id="craftable-count"></span></button>
          </div>
        </div>

        <div class="rh">
          <h2>Results</h2>
          <span class="stats" id="stats"></span>
        </div>
        <div id="results"></div>
      </div>
    `;

    const input = document.getElementById("poke-input");
    const dropdown = document.getElementById("poke-dropdown");

    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      highlightIdx = -1;
      if (!val) { dropdown.classList.remove("show"); return; }
      const matches = data.pokemon
        .filter((p) => p.name.toLowerCase().includes(val) && !selected.find((s) => s.name === p.name))
        .slice(0, 10);
      if (!matches.length) {
        dropdown.innerHTML = '<div class="dropdown-item" style="cursor:default;color:var(--text-faint)">No Pokémon found</div>';
        dropdown.classList.add("show");
        return;
      }
      dropdown.innerHTML = matches.map((p) =>
        `<div class="dropdown-item" data-name="${esc(p.name)}">${esc(p.name)} <span style="color:var(--text-dim);font-size:11px">(${p.favorites.length} favorites)</span></div>`
      ).join("");
      dropdown.classList.add("show");
      dropdown.querySelectorAll(".dropdown-item").forEach((el) => {
        el.onclick = () => addPokemon(el.dataset.name);
      });
    });

    input.addEventListener("keydown", (e) => {
      const items = dropdown.querySelectorAll(".dropdown-item");
      if (!items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlightIdx = Math.min(highlightIdx + 1, items.length - 1); updateHighlight(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlightIdx = Math.max(highlightIdx - 1, 0); updateHighlight(items); }
      else if (e.key === "Enter" && highlightIdx >= 0) { e.preventDefault(); addPokemon(items[highlightIdx].dataset.name); }
    });

    input.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (!text.includes(",")) return;
      e.preventDefault();
      let added = 0;
      text.split(",").map((s) => s.trim()).filter(Boolean).forEach((name) => {
        const poke = data.pokemon.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (poke && !selected.find((s) => s.name === poke.name)) {
          selected.push({ name: poke.name, favorites: poke.favorites, habitat: poke.habitat });
          added++;
        }
      });
      input.value = "";
      dropdown.classList.remove("show");
      if (added > 0) { renderSelected(); render(); }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#poke-search")) dropdown.classList.remove("show");
    });

    document.getElementById("clear-all").onclick = clearAll;
    document.getElementById("item-search").addEventListener("input", render);

    document.querySelectorAll(".mode-row .chip[data-m]").forEach((chip) => {
      chip.onclick = () => {
        mode = chip.dataset.m;
        document.querySelectorAll(".chip[data-m]").forEach((c) => c.classList.toggle("act", c.dataset.m === mode));
        render();
      };
    });

    document.getElementById("craftable-only-toggle").onclick = (e) => {
      craftableOnly = !craftableOnly;
      e.currentTarget.classList.toggle("act", craftableOnly);
      render();
    };

    document.getElementById("results").addEventListener("click", (e) => {
      const tagBtn = e.target.closest(".tags-toggle");
      if (tagBtn) {
        const target = document.getElementById(tagBtn.dataset.target);
        target.classList.toggle("show");
        return;
      }
      const filterBtn = e.target.closest("[data-mobile-type]");
      if (filterBtn) {
        mobileTypeFilter = filterBtn.dataset.mobileType;
        render();
      }
    });

    render();
  }

  function updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle("highlighted", i === highlightIdx));
  }

  function addPokemon(name) {
    const poke = data.pokemon.find((p) => p.name === name);
    if (!poke || selected.find((s) => s.name === name)) return;
    selected.push({ name: poke.name, favorites: poke.favorites, habitat: poke.habitat });
    document.getElementById("poke-input").value = "";
    document.getElementById("poke-dropdown").classList.remove("show");
    renderSelected();
    render();
  }

  function removePokemon(name) {
    const idx = selected.findIndex((s) => s.name === name);
    if (idx >= 0) selected.splice(idx, 1);
    renderSelected();
    render();
  }

  function clearAll() {
    selected.length = 0;
    renderSelected();
    render();
  }

  // Replaces the current selection with the given Pokémon names (unknown names are
  // ignored). Used by the Cohabitants tab's "Open in Matcher" buttons.
  function setSelection(names) {
    selected.length = 0;
    names.forEach((name) => {
      const poke = data.pokemon.find((p) => p.name === name);
      if (poke && !selected.find((s) => s.name === poke.name)) selected.push({ name: poke.name, favorites: poke.favorites, habitat: poke.habitat });
    });
    renderSelected();
    render();
  }

  function renderSelected() {
    const container = document.getElementById("selected-pokemon");
    document.getElementById("matcher-controls").style.display = selected.length ? "" : "none";
    if (!selected.length) {
      container.innerHTML = "";
      document.getElementById("habitat-summary").innerHTML = "";
      return;
    }
    // Colored by habitat trait (reusing the same badge-* colors used everywhere else),
    // not per-Pokémon identity — that only mattered back when scores were colored to match.
    container.innerHTML = selected.map((s) => `
      <div class="poke-tag badge-${s.habitat.toLowerCase()}">
        <div class="poke-tag-head">
          <strong>${esc(s.name)}</strong> ${habitatBadge(s.habitat)} <span class="fav-count">(${s.favorites.length})</span>
          <span class="remove" data-name="${esc(s.name)}">&times;</span>
        </div>
        <div class="poke-tag-favs">${esc(s.favorites.join(", "))}</div>
      </div>`
    ).join("");
    container.querySelectorAll(".remove").forEach((el) => {
      el.onclick = () => removePokemon(el.dataset.name);
    });

    renderHabitatSummary();
  }

  // Groups selected Pokémon's habitat needs by axis (Bright/Dark, Warm/Cool, Humid/Dry).
  // An axis is a conflict if two selected Pokémon need opposite poles on it — a single
  // habitat's environment settings can't satisfy both. Otherwise, the settled trait per
  // axis is what a habitat would need to make everyone happy.
  function renderHabitatSummary() {
    const box = document.getElementById("habitat-summary");
    const perAxis = {};
    selected.forEach((p) => {
      const axis = AXIS_OF[p.habitat];
      (perAxis[axis] = perAxis[axis] || {});
      (perAxis[axis][p.habitat] = perAxis[axis][p.habitat] || []).push(p.name);
    });

    const conflictAxes = Object.values(perAxis).filter((traits) => Object.keys(traits).length > 1);
    if (conflictAxes.length) {
      const lines = conflictAxes.map((traits) =>
        Object.entries(traits).map(([trait, names]) => `${habitatBadge(trait)} (${names.map(esc).join(", ")})`).join(" vs ")
      );
      box.innerHTML = `<div class="hint" style="color:var(--bad);background:var(--bad-tint);border:1px solid rgba(255,69,58,.3);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:flex-start">
        ${Icons.get("warning")}<span><strong>Habitat conflict</strong> — these Pokémon can't share one habitat's environment settings: ${lines.join("; ")}.</span>
      </div>`;
      return;
    }

    const required = Object.values(perAxis).map((traits) => Object.keys(traits)[0]);
    box.innerHTML = `<div class="hint" style="margin-bottom:12px;display:flex;gap:8px;align-items:center">${Icons.get("home")} Habitat needed to satisfy everyone: ${required.map(habitatBadge).join(" ")}</div>`;
  }

  function renderCard(s) {
    const tagCount = s.item.tags.length;
    let tagsHtml = "";
    s.item.tags.forEach((cat) => {
      const pokeIndices = s.hitMap[cat] || [];
      if (pokeIndices.length === 0) {
        tagsHtml += `<span class="tag tag-neutral">${esc(cat)}</span>`;
      } else if (pokeIndices.length === 1) {
        const col = COLORS[pokeIndices[0] % COLORS.length];
        tagsHtml += `<span class="tag" style="background:${col}20;color:${col};border:1px solid ${col}50">${esc(cat)}</span>`;
      } else {
        const cols = pokeIndices.map((i) => COLORS[i % COLORS.length]);
        const grad = cols.map((c, i) => `${c}45 ${(i * 100) / (cols.length - 1)}%`).join(",");
        tagsHtml += `<span class="tag" style="background:linear-gradient(135deg,${grad});color:var(--text);border:1px solid var(--border-strong)">${esc(cat)} (${pokeIndices.length})</span>`;
      }
    });

    // Score pills are color-coded by hit count (not by which Pokémon), so at a glance
    // red = doesn't appeal, amber = appeals a little, green = appeals a lot.
    const scoresHtml = selected.map((poke, pi) => {
      const score = s.perPoke[pi].length;
      const scoreClass = score === 0 ? "score-bad" : score === 1 ? "score-warn" : "score-good";
      return `<span class="score-badge ${scoreClass}">${esc(poke.name.substring(0, 8))}</span>`;
    }).join("");

    const typePill = s.item.type && s.item.type !== "other" && s.item.type !== "none"
      ? `<span class="type-pill pill-${s.item.type}">${s.item.type}</span>`
      : "";

    return `<div class="item-card">
      <div class="item-row-head">
        <img class="item-thumb" src="data/images/${s.item.id}.png" alt="" loading="lazy" onerror="this.remove()">
        <div class="item-name">${esc(s.item.name)} ${typePill}</div>
      </div>
      <div class="item-row-footer">
        <button class="link-btn tags-toggle" data-target="tags-${s.item.id}" title="${esc(s.item.tags.join(", "))}">${Icons.get("tag")} ${tagCount} tag${tagCount === 1 ? "" : "s"}</button>
        <div class="scores">${scoresHtml}</div>
      </div>
      <div class="item-tags collapsible-tags" id="tags-${s.item.id}">${tagsHtml}</div>
    </div>`;
  }

  function render() {
    const searchTerm = document.getElementById("item-search").value.toLowerCase();
    const res = document.getElementById("results");

    if (!selected.length) {
      res.innerHTML = '<div class="empty">Add Pokémon above to see which items appeal to them</div>';
      document.getElementById("stats").textContent = "";
      return;
    }

    const knownCount = Recipes.knownCount();
    const countEl = document.getElementById("craftable-count");
    if (countEl) countEl.textContent = knownCount ? `(${knownCount})` : "";

    const scored = [];
    data.items.forEach((item) => {
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) return;
      if (craftableOnly && !Recipes.isKnown(item.id)) return;

      const perPoke = [];
      let totalHits = 0;
      let pokemonMatched = 0;
      const hitMap = {};

      selected.forEach((poke, pi) => {
        const hits = item.tags.filter((cat) => poke.favorites.includes(cat));
        perPoke.push(hits);
        totalHits += hits.length;
        if (hits.length > 0) pokemonMatched++;
        hits.forEach((cat) => {
          (hitMap[cat] = hitMap[cat] || []).push(pi);
        });
      });

      if (totalHits === 0) return;
      if (mode === "shared" && pokemonMatched < selected.length) return;

      // Every resident's comfort is boosted by shared house items, so an item that hits
      // a few tags for everyone beats one that hits many for some and few for others —
      // rank by the worst-served Pokémon first, total hits only as a tiebreak.
      const minHits = Math.min(...perPoke.map((h) => h.length));

      scored.push({ item, perPoke, totalHits, pokemonMatched, minHits, hitMap });
    });

    if (!scored.length) {
      res.innerHTML = '<div class="empty">No items match the current filters</div>';
      document.getElementById("stats").textContent = "";
      return;
    }

    const fullyMatched = scored.filter((s) => s.pokemonMatched === selected.length).length;
    document.getElementById("stats").textContent = `${scored.length} items matched · ${fullyMatched} appeal to all ${selected.length}`;

    const sortFn = (a, b) => b.pokemonMatched - a.pokemonMatched || b.minHits - a.minHits || b.totalHits - a.totalHits || a.item.name.localeCompare(b.item.name);

    // Desktop: one horizontally-scrolling carousel per item type.
    let desktopHtml = "";
    ROWS.forEach((row) => {
      const items = scored.filter((s) => columnFor(s.item) === row.type).sort(sortFn);
      desktopHtml += `<div class="matcher-row"><div class="matcher-row-header"><span class="matcher-column-title">${Icons.get(row.icon)} ${row.label}</span><span class="matcher-column-count">${items.length} items</span></div>`;
      if (!items.length) {
        desktopHtml += '<div class="empty" style="padding:16px 8px">No matches in this category</div>';
      } else {
        desktopHtml += '<div class="carousel">' + items.map((s) => renderCard(s)).join("") + "</div>";
      }
      desktopHtml += "</div>";
    });

    // Mobile: type filter chips narrow a single vertically-stacked list (no carousel).
    const filterOptions = [{ type: "all", icon: null, label: "All" }, ...ROWS.filter((r) => r.type !== "other")];
    const filterChips = filterOptions.map((opt) =>
      `<button class="chip${mobileTypeFilter === opt.type ? " act" : ""}" data-mobile-type="${opt.type}">${opt.icon ? Icons.get(opt.icon) + " " : ""}${opt.label}</button>`
    ).join("");
    const mobileItems = scored.filter((s) => mobileTypeFilter === "all" || columnFor(s.item) === mobileTypeFilter).sort(sortFn);
    const mobileList = mobileItems.length
      ? '<div class="stacked-list">' + mobileItems.map((s) => renderCard(s)).join("") + "</div>"
      : '<div class="empty">No matches in this category</div>';
    const mobileHtml = `<div class="mode-row type-filter-row">${filterChips}</div>${mobileList}`;

    res.innerHTML = `<div class="matcher-desktop">${desktopHtml}</div><div class="matcher-mobile">${mobileHtml}</div>`;
  }

  return { init, setSelection };
})();
