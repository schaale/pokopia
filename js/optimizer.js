// Habitat Optimizer: three data-driven views built from the same QP (quality point) model
// QP(pokemon, item) = number of the pokemon's 5 favorite tags that appear on the item.
// A pokemon is considered willing to move in once the items placed with it add up to QP >= 4
// (verified against the "feasible" cut observed in the original tool's per-pokemon combos).
const Optimizer = (() => {
  const AXES = [
    ["Bright", "Dark"],
    ["Warm", "Cool"],
    ["Humid", "Dry"],
  ];
  const BADGE_ICON = { Bright: "💡", Dark: "🌑", Warm: "🌡️", Cool: "❄️", Humid: "💧", Dry: "🌵" };
  const SAT_THRESHOLD = 4;
  const PLACEABLE_TYPES = ["decor", "relaxation", "toy"];

  let data = null;
  let itemPool = null; // items usable for group building (decor/relaxation/toy)
  let blueprints = null; // computed once
  const groupCache = {}; // blueprintKey -> groups

  function qp(pokemon, item) {
    let n = 0;
    for (const tag of item.tags) if (pokemon.favorites.includes(tag)) n++;
    return n;
  }

  function jaccard(a, b) {
    const setB = new Set(b);
    let inter = 0;
    for (const x of a) if (setB.has(x)) inter++;
    const union = a.length + b.length - inter;
    return union === 0 ? 0 : inter / union;
  }

  function itemBudgetForSize(n) {
    if (n <= 4) return 16;
    if (n <= 9) return 9;
    if (n <= 12) return 6;
    if (n <= 16) return 4;
    return 2;
  }

  function blueprintCombos() {
    const combos = [];
    for (const light of AXES[0]) {
      for (const temp of AXES[1]) {
        for (const moist of AXES[2]) {
          combos.push([light, temp, moist]);
        }
      }
    }
    return combos;
  }

  function compatiblePokemon(poles) {
    return data.pokemon.filter((p) => p.favorites.length && poles.includes(p.habitat));
  }

  // Greedy max-coverage: repeatedly add the item that pushes the most pokemon past
  // SAT_THRESHOLD (ties broken by total QP added), until the budget is spent.
  function bestItemSet(pokemonGroup, budget, pool) {
    const state = pokemonGroup.map((p) => ({ p, qp: 0 }));
    const chosen = [];
    const used = new Set();
    for (let step = 0; step < budget; step++) {
      let bestItem = null;
      let bestNewSat = -1;
      let bestGain = -1;
      for (const item of pool) {
        if (used.has(item.id)) continue;
        let newSat = 0;
        let gain = 0;
        for (const s of state) {
          const q = qp(s.p, item);
          gain += q;
          if (s.qp < SAT_THRESHOLD && s.qp + q >= SAT_THRESHOLD) newSat++;
        }
        if (newSat > bestNewSat || (newSat === bestNewSat && gain > bestGain)) {
          bestNewSat = newSat;
          bestGain = gain;
          bestItem = item;
        }
      }
      if (!bestItem || (bestNewSat <= 0 && bestGain <= 0)) break;
      used.add(bestItem.id);
      chosen.push(bestItem);
      state.forEach((s) => (s.qp += qp(s.p, bestItem)));
      if (state.every((s) => s.qp >= SAT_THRESHOLD)) break;
    }
    return { chosen, state };
  }

  function clusterCompatible(pool) {
    const items = pool.slice().sort((a, b) => a.name.localeCompare(b.name));
    const remaining = new Set(items.map((p) => p.name));
    const byName = Object.fromEntries(items.map((p) => [p.name, p]));
    const groups = [];
    const MAX_SIZE = 16;
    const SIM_FLOOR = 0.15;

    while (remaining.size) {
      const seedName = remaining.values().next().value;
      remaining.delete(seedName);
      const group = [byName[seedName]];

      while (remaining.size && group.length < MAX_SIZE) {
        let bestName = null;
        let bestSim = -1;
        for (const name of remaining) {
          const cand = byName[name];
          let simSum = 0;
          for (const g of group) simSum += jaccard(cand.favorites, g.favorites);
          const avgSim = simSum / group.length;
          if (avgSim > bestSim) {
            bestSim = avgSim;
            bestName = name;
          }
        }
        if (bestSim < SIM_FLOOR) break;
        group.push(byName[bestName]);
        remaining.delete(bestName);
      }
      groups.push(group);
    }
    return groups.sort((a, b) => b.length - a.length);
  }

  function computeBlueprints() {
    return blueprintCombos().map((poles) => {
      const compat = compatiblePokemon(poles);
      const perType = {};
      let feasibleCount = 0;

      for (const p of compat) {
        const best = {};
        for (const t of PLACEABLE_TYPES) {
          let bestQ = 0;
          for (const item of itemPool) {
            if (item.type !== t) continue;
            const q = qp(p, item);
            if (q > bestQ) bestQ = q;
          }
          best[t] = bestQ;
        }
        if (best.decor + best.relaxation + best.toy >= SAT_THRESHOLD) feasibleCount++;
      }

      for (const t of PLACEABLE_TYPES) {
        const ranked = itemPool
          .filter((i) => i.type === t)
          .map((item) => {
            let totalQP = 0;
            let helped = 0;
            for (const p of compat) {
              const q = qp(p, item);
              totalQP += q;
              if (q > 0) helped++;
            }
            return { item, totalQP, helped };
          })
          .filter((r) => r.totalQP > 0)
          .sort((a, b) => b.totalQP - a.totalQP)
          .slice(0, 5);
        perType[t] = ranked;
      }

      return { poles, compat, perType, feasibleCount };
    });
  }

  function poleKey(poles) {
    return poles.join("-");
  }

  function badges(poles) {
    return poles.map((p) => `<span class="env-badge badge-${p.toLowerCase()}">${BADGE_ICON[p]} ${p}</span>`).join(" ");
  }

  // ---------- rendering ----------

  function init(pokopiaData) {
    data = pokopiaData;
    itemPool = data.items.filter((i) => PLACEABLE_TYPES.includes(i.type));
    blueprints = computeBlueprints();

    const root = document.getElementById("view-optimizer");
    root.innerHTML = `
      <div class="container">
        <div class="opt-tabs">
          <button class="opt-tab act" data-tab="eff">📦 Item Efficiency</button>
          <button class="opt-tab" data-tab="bp">🗺️ Habitat Blueprints</button>
          <button class="opt-tab" data-tab="grp">👥 Group Efficiency</button>
        </div>
        <div class="opt-panel act" id="opt-eff"></div>
        <div class="opt-panel" id="opt-bp"></div>
        <div class="opt-panel" id="opt-grp"></div>
      </div>
    `;

    document.querySelectorAll(".opt-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".opt-tab").forEach((t) => t.classList.toggle("act", t === tab));
        document.querySelectorAll(".opt-panel").forEach((p) => p.classList.remove("act"));
        document.getElementById("opt-" + tab.dataset.tab).classList.add("act");
      };
    });

    renderItemEfficiency();
    renderBlueprints();
    renderGroupPicker();
  }

  function renderItemEfficiency() {
    const panel = document.getElementById("opt-eff");
    const rows = data.pokemon
      .filter((p) => p.favorites.length)
      .map((p) => {
        const bestByType = {};
        for (const t of PLACEABLE_TYPES) {
          const ranked = itemPool
            .filter((i) => i.type === t)
            .map((item) => ({ item, q: qp(p, item) }))
            .filter((r) => r.q > 0)
            .sort((a, b) => b.q - a.q)
            .slice(0, 3);
          bestByType[t] = ranked;
        }
        const maxQP = PLACEABLE_TYPES.reduce((sum, t) => sum + (bestByType[t][0]?.q || 0), 0);
        return { pokemon: p, bestByType, maxQP, feasible: maxQP >= SAT_THRESHOLD };
      })
      .sort((a, b) => b.maxQP - a.maxQP || a.pokemon.name.localeCompare(b.pokemon.name));

    const feasible = rows.filter((r) => r.feasible).length;
    const maxBar = Math.max(...rows.map((r) => r.maxQP), 1);

    function listCell(entries) {
      if (!entries.length) return '<span style="color:#666">—</span>';
      return entries.map((e) => `<span>${escHtml(e.item.name)}</span> <span class="qp">(${e.q}QP)</span>`).join("<br>");
    }

    function rowsHtml(list) {
      return list.map((r) => `
        <tr class="ie-row" data-name="${escHtml(r.pokemon.name.toLowerCase())}">
          <td style="font-weight:600;color:#e0e0e0">${escHtml(r.pokemon.name)}</td>
          <td><span class="env-badge badge-${r.pokemon.habitat.toLowerCase()}" style="font-size:10px">${BADGE_ICON[r.pokemon.habitat]} ${r.pokemon.habitat}</span></td>
          <td><div class="qp-bar-wrap"><span class="qp-num"><span class="${r.feasible ? "feasible-yes" : "feasible-no"}">${r.feasible ? "✓" : "✗"}</span> ${r.maxQP}</span><div class="qp-bar" style="width:${Math.round((r.maxQP / maxBar) * 80)}px"></div></div></td>
          <td class="items-list">${listCell(r.bestByType.decor)}</td>
          <td class="items-list">${listCell(r.bestByType.relaxation)}</td>
          <td class="items-list">${listCell(r.bestByType.toy)}</td>
        </tr>`).join("");
    }

    panel.innerHTML = `
      <div class="stat-bar">
        <div class="stat-box"><div class="val">${feasible}</div><div class="lbl">Feasible with 3 items</div></div>
        <div class="stat-box"><div class="val">${rows.length - feasible}</div><div class="lbl">Need more items</div></div>
        <div class="stat-box"><div class="val">${Math.round((feasible / rows.length) * 100)}%</div><div class="lbl">Feasibility rate</div></div>
      </div>
      <p class="hint">Best single combo: 1 Decor + 1 Relaxation + 1 Toy. QP is the sum of favorite-tag matches across those 3 items (moving-in threshold is ${SAT_THRESHOLD} QP). Top 3 candidates are shown per slot.</p>
      <input type="text" class="search-box" id="ie-search" placeholder="Filter by Pokémon name…">
      <div class="ie-table-wrap"><table class="ie-table"><thead><tr>
        <th>Pokémon</th><th>Habitat</th><th>Max QP (3 items)</th><th>Best Decor</th><th>Best Relaxation</th><th>Best Toy</th>
      </tr></thead><tbody id="ie-tbody">${rowsHtml(rows)}</tbody></table></div>
    `;

    document.getElementById("ie-search").addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      document.querySelectorAll("#ie-tbody .ie-row").forEach((row) => {
        row.style.display = row.dataset.name.includes(val) ? "" : "none";
      });
    });
  }

  function renderBlueprints() {
    const panel = document.getElementById("opt-bp");
    const cards = blueprints.map((bp) => {
      const pct = bp.compat.length ? Math.round((bp.feasibleCount / bp.compat.length) * 100) : 0;
      const sections = PLACEABLE_TYPES.map((t) => {
        const label = t === "decor" ? "Decoration items" : t[0].toUpperCase() + t.slice(1) + " items";
        const rows = bp.perType[t].map((r) => `
          <div class="bp-item-row"><span class="bp-item-name">${escHtml(r.item.name)}</span><span class="bp-item-stat">${r.totalQP} total QP · ${r.helped} Pokémon</span></div>
        `).join("") || '<div class="bp-item-row"><span style="color:#666">No data</span></div>';
        return `<div class="bp-section"><div class="bp-section-label">${label}</div>${rows}</div>`;
      }).join("");

      return `<div class="bp-card">
        <div class="bp-title">${badges(bp.poles)}</div>
        <div class="bp-count">${bp.compat.length} compatible Pokémon · ${bp.feasibleCount} (${pct}%) feasible with 3 items</div>
        ${sections}
      </div>`;
    }).join("");

    panel.innerHTML = `
      <p class="hint">Pokopia habitats are built by picking one option on each of 3 axes (light, temperature, moisture) — 8 combinations total. Each card ranks the top items per slot by total QP contributed across every Pokémon compatible with that combination.</p>
      <div class="bp-grid">${cards}</div>
    `;
  }

  function renderGroupPicker() {
    const panel = document.getElementById("opt-grp");
    panel.innerHTML = `
      <div class="info-box">
        <div class="info-title">📐 How grouping works</div>
        <p>Pokémon that like similar things are clustered together so they can share one small item set. As a group grows, the item budget for its shared space shrinks (bigger shared area, fewer items fit): groups of ≤4 get 16 items, ≤9 get 9, ≤12 get 6, ≤16 get 4, and beyond that just 2. Pick a habitat combination below to see the suggested groups and their item sets.</p>
      </div>
      <div class="blueprint-picker" id="bp-picker"></div>
      <div id="grp-results"></div>
    `;

    const picker = document.getElementById("bp-picker");
    picker.innerHTML = blueprints.map((bp, i) =>
      `<button class="chip${i === 0 ? " act" : ""}" data-idx="${i}">${bp.poles.map((p) => BADGE_ICON[p]).join("")} ${bp.poles.join(" / ")}</button>`
    ).join("");

    picker.querySelectorAll(".chip").forEach((chip) => {
      chip.onclick = () => {
        picker.querySelectorAll(".chip").forEach((c) => c.classList.toggle("act", c === chip));
        renderGroups(blueprints[Number(chip.dataset.idx)]);
      };
    });

    renderGroups(blueprints[0]);
  }

  function renderGroups(bp) {
    const results = document.getElementById("grp-results");
    results.innerHTML = '<p class="hint">Computing groups…</p>';

    // Defer so the "computing" message paints before the (synchronous) work runs.
    setTimeout(() => {
      const key = poleKey(bp.poles);
      let groups = groupCache[key];
      if (!groups) {
        groups = clusterCompatible(bp.compat).map((members) => {
          const budget = itemBudgetForSize(members.length);
          const { chosen, state } = bestItemSet(members, budget, itemPool);
          return { members, budget, chosen, state };
        });
        groupCache[key] = groups;
      }

      const totalPoke = groups.reduce((s, g) => s + g.members.length, 0);
      const totalSat = groups.reduce((s, g) => s + g.state.filter((s2) => s2.qp >= SAT_THRESHOLD).length, 0);
      const avgSize = totalPoke ? (totalPoke / groups.length).toFixed(1) : "0";
      const avgItems = groups.length ? (groups.reduce((s, g) => s + g.chosen.length, 0) / groups.length).toFixed(1) : "0";

      const summary = `
        <div class="stat-bar">
          <div class="stat-box"><div class="val">${groups.length}</div><div class="lbl">Groups needed</div></div>
          <div class="stat-box"><div class="val">${totalSat}/${totalPoke}</div><div class="lbl">Pokémon satisfied</div></div>
          <div class="stat-box"><div class="val">${avgSize}</div><div class="lbl">Avg group size</div></div>
          <div class="stat-box"><div class="val">${avgItems}</div><div class="lbl">Avg items/group</div></div>
        </div>`;

      const cards = groups.map((g, i) => {
        const gid = key + "_" + i;
        const satCount = g.state.filter((s) => s.qp >= SAT_THRESHOLD).length;
        const full = satCount === g.members.length;
        const tightCount = g.state.filter((s) => s.qp >= SAT_THRESHOLD && s.qp < SAT_THRESHOLD + 2).length;

        const chips = g.state.map((s) => {
          const cls = s.qp >= SAT_THRESHOLD + 2 ? "sat" : s.qp >= SAT_THRESHOLD ? "tight" : "unsat";
          return `<span class="poke-chip ${cls}">${escHtml(s.p.name)} <span style="opacity:.6">(${s.qp}QP)</span></span>`;
        }).join("");

        const itemRows = g.chosen.map((it) => `<tr><td>${escHtml(it.name)}</td><td><span class="type-pill pill-${it.type}">${it.type}</span></td></tr>`).join("")
          || '<tr><td colspan="2" style="color:#666">No items found</td></tr>';

        return `<div class="group-card">
          <div class="group-header" data-gid="${gid}">
            <span class="group-title">Group ${i + 1}</span>
            <div class="group-meta">
              <span>${g.members.length} Pokémon</span>
              <span class="sat-chip ${full ? "sat-full" : "sat-partial"}">${full ? "✓ All satisfied" : satCount + "/" + g.members.length + " satisfied"}</span>
              <span>${g.chosen.length}/${g.budget} items (spatial budget)</span>
              ${tightCount ? `<span style="color:#f0c040">⚠ ${tightCount} tight (${SAT_THRESHOLD}QP)</span>` : ""}
            </div>
            <span class="group-collapse-icon" id="gi-${gid}">▼</span>
          </div>
          <div class="group-body" id="gb-${gid}">
            <div class="poke-grid">${chips}</div>
            <table class="items-table"><thead><tr><th>Item</th><th>Type</th></tr></thead><tbody>${itemRows}</tbody></table>
          </div>
        </div>`;
      }).join("");

      results.innerHTML = summary + cards;

      results.querySelectorAll(".group-header").forEach((header) => {
        header.onclick = () => {
          const gid = header.dataset.gid;
          document.getElementById("gb-" + gid).classList.toggle("open");
          const icon = document.getElementById("gi-" + gid);
          icon.textContent = document.getElementById("gb-" + gid).classList.contains("open") ? "▲" : "▼";
        };
      });
    }, 0);
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  return { init };
})();
