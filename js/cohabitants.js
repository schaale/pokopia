// Cohabitants: given the Pokémon already in (or planned for) a habitat, rank the rest of
// the roster by how well they'd cohabitate — hard-filtered on habitat compatibility, ranked
// by shared favorite tags, and spot-checked against the best shared item set (1 decor +
// 1 relaxation + 1 toy, plus free picks) to see whether everyone involved would actually
// reach the moving-in threshold (QP >= 4, same model as the Optimizer).
const Cohabitants = (() => {
  const HABITAT_OPPOSITE = { Bright: "Dark", Dark: "Bright", Warm: "Cool", Cool: "Warm", Humid: "Dry", Dry: "Humid" };
  const PLACEABLE_TYPES = ["decor", "relaxation", "toy"];
  const SAT_THRESHOLD = 4;
  const RESULT_LIMIT = 25;
  const PREFILTER = 60;
  const MAX_ITEM_SET = 8;

  let data = null;
  let itemPool = null;
  const group = []; // selected pokemon for "Find companions" mode
  let showConflicts = false;
  let targetPoke = null; // selected pokemon for "Compare my houses" mode

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function jaccard(a, b) {
    const setB = new Set(b);
    let inter = 0;
    for (const x of a) if (setB.has(x)) inter++;
    const union = a.length + b.length - inter;
    return union === 0 ? 0 : inter / union;
  }

  function qp(pokemon, item) {
    let n = 0;
    for (const tag of item.tags) if (pokemon.favorites.includes(tag)) n++;
    return n;
  }

  function pickBestItem(state, used, typeFilter) {
    let best = null;
    for (const item of itemPool) {
      if (used.has(item.id)) continue;
      if (typeFilter && item.type !== typeFilter) continue;
      let newSat = 0;
      let gain = 0;
      for (const s of state) {
        const q = qp(s.p, item);
        gain += q;
        if (s.qp < SAT_THRESHOLD && s.qp + q >= SAT_THRESHOLD) newSat++;
      }
      if (!best || newSat > best.newSat || (newSat === best.newSat && gain > best.gain)) {
        best = { item, newSat, gain };
      }
    }
    return best;
  }

  // Best shared item set across `members`: 1 mandatory decor + 1 relaxation + 1 toy,
  // then free picks up to MAX_ITEM_SET (or until everyone's satisfied, whichever first).
  // Mirrors Optimizer's bestItemSet, capped smaller since this renders inline per row.
  function bestSharedItemSet(members) {
    const state = members.map((p) => ({ p, qp: 0 }));
    const chosen = [];
    const used = new Set();

    for (const type of PLACEABLE_TYPES) {
      if (chosen.length >= MAX_ITEM_SET) break;
      const pick = pickBestItem(state, used, type);
      if (!pick) continue;
      used.add(pick.item.id);
      chosen.push(pick.item);
      state.forEach((s) => (s.qp += qp(s.p, pick.item)));
    }

    for (let step = chosen.length; step < MAX_ITEM_SET; step++) {
      if (state.every((s) => s.qp >= SAT_THRESHOLD)) break;
      const pick = pickBestItem(state, used, null);
      if (!pick || pick.gain <= 0) break;
      used.add(pick.item.id);
      chosen.push(pick.item);
      state.forEach((s) => (s.qp += qp(s.p, pick.item)));
    }

    return { chosen, state };
  }

  function findConflictPairs(members) {
    const pairs = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (HABITAT_OPPOSITE[members[i].habitat] === members[j].habitat) pairs.push([members[i], members[j]]);
      }
    }
    return pairs;
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function openInMatcher(names) {
    Matcher.setSelection(names);
    const tab = document.querySelector('#page-tabs .page-tab[data-view="matcher"]');
    if (tab) tab.click();
  }

  function habitatBadge(habitat) {
    return `<span class="env-badge badge-${habitat.toLowerCase()}">${Icons.habitat(habitat)} ${habitat}</span>`;
  }

  function kitHtml(chosen) {
    return chosen.map((i) => `<span class="type-pill pill-${i.type}">${esc(i.name)}</span>`).join(" ");
  }

  // ---------- shared name-search picker ----------

  function wirePicker({ containerId, inputId, dropdownId, isTaken, onPick }) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let hi = -1;

    function items() { return dropdown.querySelectorAll(".dropdown-item"); }
    function updateHighlight() {
      items().forEach((el, i) => el.classList.toggle("highlighted", i === hi));
    }

    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      hi = -1;
      if (!val) { dropdown.classList.remove("show"); return; }
      const matches = data.pokemon
        .filter((p) => p.favorites.length && p.name.toLowerCase().includes(val) && !isTaken(p.name))
        .slice(0, 10);
      if (!matches.length) {
        dropdown.innerHTML = '<div class="dropdown-item" style="cursor:default;color:var(--text-faint)">No Pokémon found</div>';
        dropdown.classList.add("show");
        return;
      }
      dropdown.innerHTML = matches.map((p) =>
        `<div class="dropdown-item" data-name="${esc(p.name)}">${esc(p.name)} <span style="color:var(--text-dim);font-size:11px">(${habitatIconFor(p)})</span></div>`
      ).join("");
      dropdown.classList.add("show");
      items().forEach((el) => {
        el.onclick = () => {
          onPick(el.dataset.name);
          input.value = "";
          dropdown.classList.remove("show");
        };
      });
    });

    input.addEventListener("keydown", (e) => {
      const list = items();
      if (!list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hi + 1, list.length - 1); updateHighlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(hi - 1, 0); updateHighlight(); }
      else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); list[hi].click(); }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#" + containerId)) dropdown.classList.remove("show");
    });
  }

  function habitatIconFor(p) {
    return `${Icons.habitat(p.habitat)} ${p.habitat}`;
  }

  // ---------- Find companions mode ----------

  function addToGroup(name) {
    const poke = data.pokemon.find((p) => p.name === name);
    if (!poke || group.find((p) => p.name === name)) return;
    group.push(poke);
    renderGroupChips();
    renderFindResults();
  }

  function removeFromGroup(name) {
    const idx = group.findIndex((p) => p.name === name);
    if (idx >= 0) group.splice(idx, 1);
    renderGroupChips();
    renderFindResults();
  }

  function renderGroupChips() {
    const container = document.getElementById("coh-selected");
    container.innerHTML = group.map((p) => `<div class="poke-tag" style="background:var(--accent-tint);border-color:var(--accent);color:var(--accent)">
      ${esc(p.name)} <span class="fav-count">${habitatIconFor(p)}</span>
      <span class="remove" data-name="${esc(p.name)}">&times;</span></div>`).join("");
    container.querySelectorAll(".remove").forEach((el) => { el.onclick = () => removeFromGroup(el.dataset.name); });

    const warn = document.getElementById("coh-conflict-warning");
    const pairs = findConflictPairs(group);
    warn.innerHTML = pairs.length
      ? `<div class="hint" style="color:var(--bad);margin-top:8px;display:flex;gap:6px;align-items:flex-start">${Icons.get("warning")}<span>Habitat conflict in your selection: ${pairs.map((pr) => `${esc(pr[0].name)} (${pr[0].habitat}) vs ${esc(pr[1].name)} (${pr[1].habitat})`).join("; ")} — these can't share one habitat's environment settings.</span></div>`
      : "";
  }

  function renderFindResults() {
    const results = document.getElementById("coh-results");
    const statsEl = document.getElementById("coh-stats");
    const searchTerm = document.getElementById("coh-name-search").value.toLowerCase().trim();

    const toggleBtn = document.getElementById("coh-toggle-conflicts");
    toggleBtn.classList.toggle("act", showConflicts);
    toggleBtn.textContent = showConflicts ? "Hide habitat conflicts" : "Show habitat conflicts too";

    const openBtn = document.getElementById("coh-open-matcher");
    openBtn.style.display = group.length ? "" : "none";

    if (!group.length) {
      results.innerHTML = '<div class="empty">Add a Pokémon above to see companion suggestions</div>';
      statsEl.textContent = "";
      return;
    }

    const groupNames = new Set(group.map((p) => p.name));
    const pool = data.pokemon.filter((p) =>
      p.favorites.length && !groupNames.has(p.name) && (!searchTerm || p.name.toLowerCase().includes(searchTerm))
    );

    const compatible = [];
    const conflicting = [];
    pool.forEach((p) => {
      const conflictMembers = group.filter((m) => HABITAT_OPPOSITE[m.habitat] === p.habitat);
      const avg = group.reduce((s, m) => s + jaccard(p.favorites, m.favorites), 0) / group.length;
      const sharedUnion = p.favorites.filter((t) => group.some((m) => m.favorites.includes(t)));
      const perMember = group.map((m) => ({ name: m.name, shared: p.favorites.filter((t) => m.favorites.includes(t)) }));
      const entry = { poke: p, avg, sharedUnion, perMember, conflictMembers };
      (conflictMembers.length ? conflicting : compatible).push(entry);
    });

    compatible.sort((a, b) => b.avg - a.avg || b.sharedUnion.length - a.sharedUnion.length || a.poke.name.localeCompare(b.poke.name));

    const forFeasibility = compatible.slice(0, PREFILTER);
    forFeasibility.forEach((entry) => {
      const { chosen, state } = bestSharedItemSet(group.concat([entry.poke]));
      entry.chosen = chosen;
      entry.feasible = state.every((s) => s.qp >= SAT_THRESHOLD);
      entry.satCount = state.filter((s) => s.qp >= SAT_THRESHOLD).length;
    });
    forFeasibility.sort((a, b) =>
      (b.feasible - a.feasible) || b.avg - a.avg || b.sharedUnion.length - a.sharedUnion.length || a.poke.name.localeCompare(b.poke.name)
    );

    const display = forFeasibility.slice(0, RESULT_LIMIT);
    statsEl.textContent = `${compatible.length} habitat-compatible · ${conflicting.length} conflict`;

    let h = display.length ? renderFindTable(display) : '<div class="empty">No habitat-compatible candidates match the filter</div>';

    if (showConflicts && conflicting.length) {
      conflicting.sort((a, b) => a.poke.name.localeCompare(b.poke.name));
      h += `<div class="rh" style="margin-top:20px"><h2>Habitat conflicts</h2><span class="stats">${conflicting.length} excluded</span></div>`;
      h += renderConflictTable(conflicting);
    }

    results.innerHTML = h;
  }

  function renderFindTable(display) {
    const rows = display.map((e) => {
      const pct = Math.round(e.avg * 100);
      const memberBadges = e.perMember.map((m) =>
        `<span class="score-badge" style="background:rgba(38,49,27,.07);color:var(--text-dim)">${esc(m.name.substring(0, 10))}:${m.shared.length}</span>`
      ).join(" ");
      const sharedTags = e.sharedUnion.length
        ? e.sharedUnion.map((t) => `<span class="tag" style="background:var(--info-tint);color:var(--info);border:1px solid rgba(10,132,255,.3)">${esc(t)}</span>`).join("")
        : '<span style="color:var(--text-faint)">—</span>';
      const feasBadge = e.feasible
        ? `<span class="feasible-yes">${Icons.get("check")} all satisfied</span>`
        : `<span class="feasible-no">${e.satCount}/${group.length + 1} satisfied</span>`;
      const names = group.map((m) => m.name).concat([e.poke.name]).join("|");
      return `<tr>
        <td style="font-weight:600;color:var(--text)">${esc(e.poke.name)}</td>
        <td>${habitatBadge(e.poke.habitat)}</td>
        <td><div>${pct}% avg overlap</div><div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${memberBadges}</div></td>
        <td class="item-tags" style="justify-content:flex-start">${sharedTags}</td>
        <td>${feasBadge}<div style="margin-top:4px">${kitHtml(e.chosen)}</div>
          <button class="link-btn open-matcher-btn" data-names="${esc(names)}">${Icons.get("link")} Open in Matcher</button>
        </td>
      </tr>`;
    }).join("");
    return `<div class="ie-table-wrap"><table class="ie-table"><thead><tr>
      <th>Pokémon</th><th>Habitat</th><th>Compatibility</th><th>Shared favorites</th><th>Suggested items (up to ${MAX_ITEM_SET})</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderConflictTable(conflicting) {
    const rows = conflicting.map((e) => `<tr>
      <td style="font-weight:600;color:var(--text)">${esc(e.poke.name)}</td>
      <td>${habitatBadge(e.poke.habitat)}</td>
      <td style="color:var(--bad)">${Icons.get("warning")} conflicts with ${e.conflictMembers.map((m) => esc(m.name)).join(", ")}</td>
    </tr>`).join("");
    return `<div class="ie-table-wrap"><table class="ie-table"><thead><tr><th>Pokémon</th><th>Habitat</th><th>Conflict</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- Compare my houses mode ----------

  function setTarget(name) {
    const poke = data.pokemon.find((p) => p.name === name);
    if (!poke) return;
    targetPoke = poke;
    renderTargetChip();
    renderCompare();
  }

  function clearTarget() {
    targetPoke = null;
    renderTargetChip();
    renderCompare();
  }

  function renderTargetChip() {
    const container = document.getElementById("target-selected");
    container.innerHTML = targetPoke
      ? `<div class="poke-tag" style="background:var(--accent-tint);border-color:var(--accent);color:var(--accent)">
          ${esc(targetPoke.name)} <span class="fav-count">${habitatIconFor(targetPoke)}</span>
          <span class="remove" data-name="${esc(targetPoke.name)}">&times;</span></div>`
      : "";
    const remove = container.querySelector(".remove");
    if (remove) remove.onclick = clearTarget;
  }

  function parseHouses(text) {
    return text.split("\n").map((s) => s.trim()).filter(Boolean).map((line, idx) => {
      const names = line.split(",").map((s) => s.trim()).filter(Boolean);
      const members = [];
      const unknown = [];
      names.forEach((n) => {
        const p = data.pokemon.find((pp) => pp.name.toLowerCase() === n.toLowerCase());
        if (p) members.push(p); else unknown.push(n);
      });
      return { idx, members, unknown };
    });
  }

  function renderCompare() {
    const results = document.getElementById("compare-results");
    if (!targetPoke) {
      results.innerHTML = '<div class="empty">Pick the Pokémon that needs a home above</div>';
      return;
    }
    const houses = parseHouses(document.getElementById("houses-input").value);
    if (!houses.length) {
      results.innerHTML = '<div class="empty">List your existing houses above, one per line (comma-separated Pokémon names)</div>';
      return;
    }

    const scored = houses.map((h) => {
      if (!h.members.length) return { ...h, empty: true };
      const conflictMembers = h.members.filter((m) => HABITAT_OPPOSITE[m.habitat] === targetPoke.habitat);
      const avg = h.members.reduce((s, m) => s + jaccard(targetPoke.favorites, m.favorites), 0) / h.members.length;
      let chosen = [];
      let feasible = false;
      let satCount = 0;
      if (!conflictMembers.length) {
        const r = bestSharedItemSet(h.members.concat([targetPoke]));
        chosen = r.chosen;
        feasible = r.state.every((s) => s.qp >= SAT_THRESHOLD);
        satCount = r.state.filter((s) => s.qp >= SAT_THRESHOLD).length;
      }
      return { ...h, conflictMembers, avg, feasible, chosen, satCount };
    });

    scored.sort((a, b) => {
      if (!!a.empty !== !!b.empty) return a.empty ? 1 : -1;
      if (a.empty) return 0;
      const aConf = a.conflictMembers.length > 0;
      const bConf = b.conflictMembers.length > 0;
      if (aConf !== bConf) return aConf ? 1 : -1;
      if (aConf) return 0;
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      return b.avg - a.avg;
    });

    results.innerHTML = scored.map((h, rank) => renderHouseCard(h, rank)).join("");
  }

  function renderHouseCard(h, rank) {
    const title = h.members && h.members.length
      ? `House ${h.idx + 1}: ${h.members.map((m) => esc(m.name)).join(", ")}`
      : `House ${h.idx + 1} (no recognized Pokémon)`;

    let body = "";
    if (h.unknown.length) body += `<div class="hint" style="color:var(--warn)">${Icons.get("warning")} Not recognized: ${h.unknown.map(esc).join(", ")}</div>`;

    if (h.empty) {
      body += '<div class="hint">Add at least one recognized Pokémon name to this line.</div>';
    } else if (h.conflictMembers.length) {
      body += `<div class="hint" style="color:var(--bad)">${Icons.get("warning")} ${esc(targetPoke.name)} (${targetPoke.habitat}) conflicts with ${h.conflictMembers.map((m) => esc(m.name)).join(", ")} — can't share a habitat here.</div>`;
    } else {
      const pct = Math.round(h.avg * 100);
      const names = h.members.map((m) => m.name).concat([targetPoke.name]).join("|");
      body += `<div>${pct}% avg overlap with ${esc(targetPoke.name)} · ${h.feasible
        ? `<span class="feasible-yes">${Icons.get("check")} everyone reaches the moving-in threshold with a shared item set</span>`
        : `<span class="feasible-no">${h.satCount}/${h.members.length + 1} satisfied with a shared item set</span>`}</div>
        <div style="margin-top:6px">${kitHtml(h.chosen)}</div>
        <button class="link-btn open-matcher-btn" data-names="${esc(names)}" style="margin-top:6px">${Icons.get("link")} Open in Matcher</button>`;
    }

    const badge = (!h.empty && !h.conflictMembers.length && rank === 0) ? `<span class="sat-chip sat-full">${Icons.get("trophy")} Best fit</span>` : "";

    return `<div class="group-card"><div class="group-header" style="cursor:default">
        <span class="group-title">${title}</span>${badge}
      </div><div class="group-body open" style="display:block">${body}</div></div>`;
  }

  // ---------- init ----------

  function init(pokopiaData) {
    data = pokopiaData;
    itemPool = data.items.filter((i) => PLACEABLE_TYPES.includes(i.type));

    const root = document.getElementById("view-cohabitants");
    root.innerHTML = `
      <div class="container">
        <div class="opt-tabs">
          <button class="opt-tab act" data-cmode="find">${Icons.get("search")} Find Companions</button>
          <button class="opt-tab" data-cmode="compare">${Icons.get("home")} Compare My Houses</button>
        </div>

        <div class="opt-panel act" id="coh-find">
          <div class="card poke-section">
            <h2>Pokémon already living there <span class="sub">(or just the one you're moving — type to search, click to add)</span></h2>
            <div class="selected-pokemon" id="coh-selected"></div>
            <div id="coh-conflict-warning"></div>
            <button class="link-btn" id="coh-open-matcher" style="margin-top:8px;margin-bottom:8px">${Icons.get("link")} Open this group in Matcher</button>
            <div class="poke-input-row">
              <div class="poke-search" id="coh-search">
                <input type="text" id="coh-input" placeholder="Type a Pokémon name…" autocomplete="off">
                <div class="dropdown" id="coh-dropdown"></div>
              </div>
              <button class="clear-all" id="coh-clear">Clear all</button>
            </div>
          </div>

          <p class="hint">Habitat-compatible candidates are ranked by average overlap of favorite tags with everyone already selected, then spot-checked against the best shared item set (1 Decor + 1 Relaxation + 1 Toy, plus free picks up to ${MAX_ITEM_SET} items or until everyone clears the moving-in threshold of ${SAT_THRESHOLD} QP — same model as the Optimizer). Feasibility is computed for the top ${PREFILTER} matches by overlap.</p>

          <div class="mode-row">
            <button class="chip" id="coh-toggle-conflicts">Show habitat conflicts too</button>
          </div>
          <input type="text" class="search-box" id="coh-name-search" placeholder="Filter candidates by name…">

          <div class="rh"><h2>Best companions</h2><span class="stats" id="coh-stats"></span></div>
          <div id="coh-results"></div>
        </div>

        <div class="opt-panel" id="coh-compare">
          <div class="card poke-section">
            <h2>Pokémon that needs a home <span class="sub">(pick one)</span></h2>
            <div class="selected-pokemon" id="target-selected"></div>
            <div class="poke-input-row">
              <div class="poke-search" id="target-search">
                <input type="text" id="target-input" placeholder="Type a Pokémon name…" autocomplete="off">
                <div class="dropdown" id="target-dropdown"></div>
              </div>
            </div>
          </div>

          <div class="card poke-section">
            <h2>Your existing houses <span class="sub">(one per line, comma-separated Pokémon names)</span></h2>
            <textarea id="houses-input" rows="5" placeholder="Pidgey, Rattata, Bidoof&#10;Growlithe, Vulpix&#10;Magikarp, Poliwag"></textarea>
          </div>

          <div class="rh"><h2>Which house fits best?</h2></div>
          <div id="compare-results"></div>
        </div>
      </div>
    `;

    document.querySelectorAll("#view-cohabitants .opt-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll("#view-cohabitants .opt-tab").forEach((t) => t.classList.toggle("act", t === tab));
        document.getElementById("coh-find").classList.toggle("act", tab.dataset.cmode === "find");
        document.getElementById("coh-compare").classList.toggle("act", tab.dataset.cmode === "compare");
      };
    });

    wirePicker({
      containerId: "coh-search",
      inputId: "coh-input",
      dropdownId: "coh-dropdown",
      isTaken: (name) => group.some((p) => p.name === name),
      onPick: addToGroup,
    });
    document.getElementById("coh-clear").onclick = () => {
      group.length = 0;
      renderGroupChips();
      renderFindResults();
    };
    document.getElementById("coh-name-search").addEventListener("input", debounce(renderFindResults, 150));
    document.getElementById("coh-toggle-conflicts").onclick = () => {
      showConflicts = !showConflicts;
      renderFindResults();
    };
    document.getElementById("coh-open-matcher").onclick = () => openInMatcher(group.map((p) => p.name));
    document.getElementById("coh-results").addEventListener("click", (e) => {
      const btn = e.target.closest(".open-matcher-btn");
      if (btn) openInMatcher(btn.dataset.names.split("|"));
    });
    document.getElementById("compare-results").addEventListener("click", (e) => {
      const btn = e.target.closest(".open-matcher-btn");
      if (btn) openInMatcher(btn.dataset.names.split("|"));
    });

    wirePicker({
      containerId: "target-search",
      inputId: "target-input",
      dropdownId: "target-dropdown",
      isTaken: (name) => targetPoke && targetPoke.name === name,
      onPick: setTarget,
    });
    document.getElementById("houses-input").addEventListener("input", renderCompare);

    renderFindResults();
    renderCompare();
  }

  return { init };
})();
