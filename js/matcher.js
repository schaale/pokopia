// Favorites Matcher: pick Pokémon, see which items appeal to them, grouped by coverage
// and split into columns by item type (Decor / Relaxation / Toy / Other).
const Matcher = (() => {
  const COLORS = ["#e63946","#48cae4","#a855f7","#22c55e","#f97316","#ec4899","#14b8a6","#eab308",
    "#6366f1","#ef4444","#0ea5e9","#8b5cf6","#f43f5e","#06b6d4","#d946ef","#84cc16",
    "#fb923c","#f472b6","#2dd4bf","#fbbf24","#818cf8","#fb7185","#38bdf8","#c084fc"];

  const HABITAT_OPPOSITE = { Bright: "Dark", Dark: "Bright", Warm: "Cool", Cool: "Warm", Humid: "Dry", Dry: "Humid" };
  const AXIS_OF = { Bright: "light", Dark: "light", Warm: "temp", Cool: "temp", Humid: "moist", Dry: "moist" };
  const BADGE_ICON = { Bright: "💡", Dark: "🌑", Warm: "🌡️", Cool: "❄️", Humid: "💧", Dry: "🌵" };

  const COLUMNS = [
    { type: "decor", icon: "🖼️", label: "Decor" },
    { type: "relaxation", icon: "🛋️", label: "Relaxation" },
    { type: "toy", icon: "🧸", label: "Toy" },
    { type: "other", icon: "📦", label: "Other" }, // road / none / other — still carry real preference tags
  ];
  const TIER_PREVIEW = 6;

  let data = null;
  const selected = []; // [{name, favorites, habitat}]
  let mode = "shared"; // 'all' | 'shared' — default to "Appeals to all"
  let highlightIdx = -1;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function habitatBadge(habitat) {
    return `<span class="env-badge badge-${habitat.toLowerCase()}" style="font-size:10px">${BADGE_ICON[habitat]} ${habitat}</span>`;
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

        <div class="legend" id="legend" style="display:none"></div>

        <div id="matcher-controls" style="display:none">
          <input type="text" class="search-box" id="item-search" placeholder="Filter items by name…">

          <div class="mode-row">
            <span class="lbl">Show:</span>
            <button class="chip" data-m="all">All matches</button>
            <button class="chip act" data-m="shared">Appeals to all</button>
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
        dropdown.innerHTML = '<div class="dropdown-item" style="cursor:default;color:#666">No Pokémon found</div>';
        dropdown.classList.add("show");
        return;
      }
      dropdown.innerHTML = matches.map((p) =>
        `<div class="dropdown-item" data-name="${esc(p.name)}">${esc(p.name)} <span style="color:#888;font-size:11px">(${p.favorites.length} favorites)</span></div>`
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

    document.getElementById("results").addEventListener("click", (e) => {
      const tierBtn = e.target.closest(".tier-toggle");
      if (tierBtn) {
        const target = document.getElementById(tierBtn.dataset.target);
        const expand = target.style.display === "none";
        target.style.display = expand ? "" : "none";
        tierBtn.textContent = expand ? "Show less ←" : `Show ${tierBtn.dataset.remaining} more →`;
        return;
      }
      const tagBtn = e.target.closest(".tags-toggle");
      if (tagBtn) {
        const target = document.getElementById(tagBtn.dataset.target);
        target.classList.toggle("show");
        return;
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
    const legend = document.getElementById("legend");
    document.getElementById("matcher-controls").style.display = selected.length ? "" : "none";
    if (!selected.length) {
      container.innerHTML = "";
      legend.style.display = "none";
      document.getElementById("habitat-summary").innerHTML = "";
      return;
    }
    container.innerHTML = selected.map((s, i) => {
      const col = COLORS[i % COLORS.length];
      return `<div class="poke-tag" style="background:${col}20;border-color:${col};color:${col}">
        ${esc(s.name)} ${habitatBadge(s.habitat)} <span class="fav-count">(${s.favorites.length})</span>
        <span class="remove" data-name="${esc(s.name)}">&times;</span></div>`;
    }).join("");
    container.querySelectorAll(".remove").forEach((el) => {
      el.onclick = () => removePokemon(el.dataset.name);
    });

    legend.style.display = "flex";
    legend.innerHTML = selected.map((s, i) => {
      const col = COLORS[i % COLORS.length];
      return `<div class="legend-item"><span class="legend-dot" style="background:${col}"></span><strong style="color:${col}">${esc(s.name)}:</strong> ${esc(s.favorites.join(", "))}</div>`;
    }).join("");

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
      box.innerHTML = `<div class="hint" style="color:var(--bad);background:#2a1a1a;border:1px solid #5a2a2a;border-radius:8px;padding:10px 12px;margin-bottom:12px">
        ⚠ <strong>Habitat conflict</strong> — these Pokémon can't share one habitat's environment settings: ${lines.join("; ")}.
      </div>`;
      return;
    }

    const required = Object.values(perAxis).map((traits) => Object.keys(traits)[0]);
    box.innerHTML = `<div class="hint" style="margin-bottom:12px">🏠 Habitat needed to satisfy everyone: ${required.map(habitatBadge).join(" ")}</div>`;
  }

  function renderItemRow(s) {
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
        const grad = cols.map((c, i) => `${c}30 ${(i * 100) / (cols.length - 1)}%`).join(",");
        tagsHtml += `<span class="tag" style="background:linear-gradient(135deg,${grad});color:#fff;border:1px solid #a855f780">${esc(cat)} (${pokeIndices.length})</span>`;
      }
    });

    const scoresHtml = selected.map((poke, pi) => {
      const col = COLORS[pi % COLORS.length];
      const score = s.perPoke[pi].length;
      return `<span class="score-badge" style="background:${col}20;color:${col}">${esc(poke.name.substring(0, 8))}:${score}</span>`;
    }).join("");

    const typePill = s.item.type && s.item.type !== "other" && s.item.type !== "none"
      ? `<span class="type-pill pill-${s.item.type}">${s.item.type}</span>`
      : "";

    return `<div class="item-row">
      <div class="item-name">${esc(s.item.name)} ${typePill}</div>
      <div class="item-row-footer">
        <button class="link-btn tags-toggle" data-target="tags-${s.item.id}" title="${esc(s.item.tags.join(", "))}">🏷️ ${tagCount} tag${tagCount === 1 ? "" : "s"}</button>
        <div class="scores">${scoresHtml}</div>
      </div>
      <div class="item-tags collapsible-tags" id="tags-${s.item.id}">${tagsHtml}</div>
    </div>`;
  }

  // One pokemonMatched-count group ("All N pokémon" / "N of M pokémon"), sorted by total
  // hits then name — no further splitting by exact hit count or min-per-pokémon score.
  function renderGroup(colType, list, total) {
    const allMatched = list[0].pokemonMatched === total;
    const label = allMatched ? `All ${total} pokémon` : `${list[0].pokemonMatched} of ${total} pokémon`;
    const tierClass = allMatched ? "tier-s" : list[0].pokemonMatched > 1 ? "tier-b" : "tier-c";
    const gid = `${colType}-${list[0].pokemonMatched}`;

    let h = `<div class="tier"><div class="tier-label ${tierClass}">${label}<span class="cnt">(${list.length} items)</span></div><div class="tier-items">`;
    const visible = list.slice(0, TIER_PREVIEW);
    const hidden = list.slice(TIER_PREVIEW);
    visible.forEach((s) => { h += renderItemRow(s); });
    if (hidden.length) {
      h += `<div class="tier-hidden" id="tier-hidden-${gid}" style="display:none">`;
      hidden.forEach((s) => { h += renderItemRow(s); });
      h += "</div>";
      h += `<button class="link-btn tier-toggle" data-target="tier-hidden-${gid}" data-remaining="${hidden.length}" style="display:block;margin:8px 14px">Show ${hidden.length} more →</button>`;
    }
    h += "</div></div>";
    return h;
  }

  function render() {
    const searchTerm = document.getElementById("item-search").value.toLowerCase();
    const res = document.getElementById("results");

    if (!selected.length) {
      res.innerHTML = '<div class="empty">Add Pokémon above to see which items appeal to them</div>';
      document.getElementById("stats").textContent = "";
      return;
    }

    const scored = [];
    data.items.forEach((item) => {
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) return;

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

      scored.push({ item, perPoke, totalHits, pokemonMatched, hitMap });
    });

    if (!scored.length) {
      res.innerHTML = '<div class="empty">No items match the current filters</div>';
      document.getElementById("stats").textContent = "";
      return;
    }

    const fullyMatched = scored.filter((s) => s.pokemonMatched === selected.length).length;
    document.getElementById("stats").textContent = `${scored.length} items matched · ${fullyMatched} appeal to all ${selected.length}`;

    const sortFn = (a, b) => b.pokemonMatched - a.pokemonMatched || b.totalHits - a.totalHits || a.item.name.localeCompare(b.item.name);

    let h = '<div class="matcher-columns">';
    COLUMNS.forEach((col) => {
      const items = scored.filter((s) => columnFor(s.item) === col.type).sort(sortFn);
      h += `<div class="matcher-column"><div class="matcher-column-header"><span class="matcher-column-title">${col.icon} ${col.label}</span><span class="matcher-column-count">${items.length} items</span></div>`;
      if (!items.length) {
        h += '<div class="empty" style="padding:20px 8px">No matches in this category</div>';
      } else {
        let groupStart = 0;
        while (groupStart < items.length) {
          const matched = items[groupStart].pokemonMatched;
          let groupEnd = groupStart + 1;
          while (groupEnd < items.length && items[groupEnd].pokemonMatched === matched) groupEnd++;
          h += renderGroup(col.type, items.slice(groupStart, groupEnd), selected.length);
          groupStart = groupEnd;
        }
      }
      h += "</div>";
    });
    h += "</div>";

    res.innerHTML = h;
  }

  return { init, setSelection };
})();
