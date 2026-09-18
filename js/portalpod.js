// Portal Pod optimizer: which materials are worth dedicating a permanent storage slot to,
// and how many. A slot costs the same whether it holds 1 unit or the 99-unit cap, so the
// only real decision is how many of the pod's slots (20 per page × 4 pages = 80) go to each
// material. The starting allocation below came from a manual pass over the game's recipe
// list — recipe count per material (collapsing reskin families like wallpaper/poster prints
// so they don't overweight one material), plus a bump for materials consumed in bulk by
// prefab building kits (Windmill, Leaf House, etc). It's a starting point, not gospel —
// every count here is editable, and every material defaults to at least 1 slot so nothing
// is ever completely unbuildable while away from a gathering spot.
const PortalPod = (() => {
  const STORAGE_KEY = "pokopia.portalPod";
  const POD_CAPACITY = 80;
  const SLOTS_PER_PAGE = 20;
  const MAX_QTY = 99;

  let defaults = [];
  let overrides = {}; // name (lowercased) -> slot count
  let removed = new Set(); // lowercased default names hidden by the user
  let custom = []; // [{name, slots}] materials the user added that aren't in defaults

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // esc() only escapes text-node content (&, <, >) — safe inside tags but not inside a
  // quoted attribute value, since it leaves quote characters untouched.
  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function key(name) {
    return name.trim().toLowerCase();
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      overrides = raw.overrides || {};
      removed = new Set(raw.removed || []);
      custom = raw.custom || [];
    } catch {
      overrides = {};
      removed = new Set();
      custom = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        overrides, removed: [...removed], custom,
      }));
    } catch {
      // localStorage unavailable — edits just won't persist across visits
    }
  }

  // The live, merged material list: baked-in defaults (minus anything the user removed,
  // with any slot-count overrides applied) plus whatever the user has added themselves.
  // Sorted by natural in-game order (Bulbapedia's item-list order — Materials category
  // first, then everything else grouped by its own category) so it can be scanned
  // side by side with the game; materials this app doesn't have a game order for
  // (anything user-added) sort alphabetically after everything that does.
  function materials() {
    const list = defaults
      .filter((m) => !removed.has(key(m.name)))
      .map((m) => ({ name: m.name, img: m.img, order: m.order, slots: overrides[key(m.name)] ?? m.slots, isDefault: true }));
    custom.forEach((c) => list.push({ name: c.name, img: null, order: null, slots: c.slots, isDefault: false }));
    return list.sort((a, b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function totalSlots() {
    return materials().reduce((sum, m) => sum + m.slots, 0);
  }

  function setSlots(name, slots) {
    slots = Math.max(1, Math.min(99, slots));
    const isDefaultName = defaults.some((m) => key(m.name) === key(name));
    if (isDefaultName) {
      overrides[key(name)] = slots;
    } else {
      const c = custom.find((c) => key(c.name) === key(name));
      if (c) c.slots = slots;
    }
    save();
  }

  function removeMaterial(name) {
    const isDefaultName = defaults.some((m) => key(m.name) === key(name));
    if (isDefaultName) {
      removed.add(key(name));
    } else {
      custom = custom.filter((c) => key(c.name) !== key(name));
    }
    save();
  }

  function addMaterial(name, slots) {
    name = name.trim();
    if (!name) return;
    slots = Math.max(1, Math.min(99, slots || 1));
    // Re-adding a removed default just un-hides it with the requested slot count.
    const def = defaults.find((m) => key(m.name) === key(name));
    if (def) {
      removed.delete(key(name));
      overrides[key(name)] = slots;
      save();
      return;
    }
    const existing = custom.find((c) => key(c.name) === key(name));
    if (existing) {
      existing.slots = slots;
    } else {
      custom.push({ name, slots });
    }
    save();
  }

  function resetToDefaults() {
    overrides = {};
    removed = new Set();
    custom = [];
    save();
  }

  function thumbHtml(m) {
    if (m.img != null) {
      return `<img class="item-thumb" src="data/images/${m.img}.png" alt="" loading="lazy" data-fallback="${escAttr(m.name[0].toUpperCase())}" onerror="PortalPod._imgFail(this)">`;
    }
    return `<span class="item-thumb pod-fallback">${esc(m.name[0].toUpperCase())}</span>`;
  }

  // Swaps a broken item thumbnail (material not in our local image set) for a plain
  // letter tile — wired via onerror since <img> load failures don't bubble, so a single
  // delegated listener on an ancestor can't catch them.
  function imgFail(img) {
    const span = document.createElement("span");
    span.className = "item-thumb pod-fallback";
    span.textContent = img.dataset.fallback || "?";
    img.replaceWith(span);
  }

  function renderSummary() {
    const total = totalSlots();
    const free = POD_CAPACITY - total;
    document.getElementById("pp-total").textContent = total;
    const freeEl = document.getElementById("pp-free");
    freeEl.textContent = free >= 0 ? free : `${Math.abs(free)} over`;
    freeEl.style.color = free < 0 ? "var(--bad)" : free === 0 ? "var(--good)" : "";
  }

  function renderAllocList() {
    const list = materials();
    document.getElementById("pp-alloc-stats").textContent = `${list.length} materials tracked`;
    document.getElementById("pp-alloc-list").innerHTML = list.map((m) => `
      <div class="pp-row" data-name="${escAttr(m.name)}">
        <span class="pp-thumb">${thumbHtml(m)}</span>
        <span class="pp-name">${esc(m.name)}</span>
        <span class="pp-stepper">
          <button type="button" class="pp-dec" aria-label="Fewer slots">&minus;</button>
          <span class="pp-count">${m.slots}</span>
          <button type="button" class="pp-inc" aria-label="More slots">&plus;</button>
        </span>
        <button type="button" class="pp-remove" title="Stop tracking this material">&times;</button>
      </div>
    `).join("");
  }

  function renderGrid() {
    const list = materials();
    const cells = [];
    list.forEach((m) => {
      for (let i = 0; i < m.slots; i++) cells.push(m);
    });
    const pageCount = Math.max(4, Math.ceil(cells.length / SLOTS_PER_PAGE));
    let html = "";
    for (let p = 0; p < pageCount; p++) {
      const pageCells = cells.slice(p * SLOTS_PER_PAGE, (p + 1) * SLOTS_PER_PAGE);
      while (pageCells.length < SLOTS_PER_PAGE) pageCells.push(null);
      html += `<div class="pod-page">
        <div class="pod-page-label">Page ${p + 1}</div>
        <div class="pod-slots">${pageCells.map((m) => m
          ? `<div class="pod-slot" title="${escAttr(m.name)}">${thumbHtml(m)}<span class="pod-qty">${MAX_QTY}</span></div>`
          : `<div class="pod-slot pod-empty"></div>`
        ).join("")}</div>
      </div>`;
    }
    document.getElementById("pp-grid").innerHTML = html;
  }

  function render() {
    renderSummary();
    renderAllocList();
    renderGrid();
  }

  function init(portalPodDefaults) {
    defaults = portalPodDefaults;
    load();

    const root = document.getElementById("view-portalpod");
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>Portal Pod <span class="sub">optimize your 80-slot loadout</span></h2>
          <p class="hint">
            The pod holds 80 slots (20 per page × 4 pages), and a slot costs the same whether
            it's got 1 unit in it or the 99-unit cap — so every slot below is assumed maxed,
            and the only thing worth tuning is how many slots each material gets. The starting
            counts are a rough pass over recipe demand plus prefab-building-kit demand; every
            material defaults to at least 1 slot so you can always craft something rather than
            hoarding a big pile of one thing and zero of another. Both lists below are sorted
            in natural in-game order (Bulbapedia's Materials category first, then everything
            else grouped by its own category) so you can scan them next to the game. Adjust
            freely — a few materials (no photo, just a letter) aren't in this app's item
            database yet, and the crafting berries aren't itemized here at all, so add any of
            those yourself with the box below if you want them tracked.
          </p>
          <div class="stat-bar" style="margin-top:var(--sp-4);margin-bottom:0">
            <div class="stat-box"><div class="val" id="pp-total">0</div><div class="lbl">slots allocated</div></div>
            <div class="stat-box"><div class="val">${POD_CAPACITY}</div><div class="lbl">pod capacity</div></div>
            <div class="stat-box"><div class="val" id="pp-free">0</div><div class="lbl">free / over</div></div>
          </div>
        </div>

        <div class="rh" style="margin-top:var(--sp-5)">
          <h2>Allocations</h2>
          <span class="stats" id="pp-alloc-stats"></span>
        </div>
        <div class="poke-input-row">
          <input type="text" class="search-box" id="pp-add-name" placeholder="Add a material by name…" style="flex:1;margin-bottom:0">
          <input type="number" id="pp-add-slots" min="1" max="99" value="1" style="width:70px">
          <button class="chip" id="pp-add-btn">Add</button>
          <button class="clear-all" id="pp-reset">Reset to defaults</button>
        </div>
        <div id="pp-alloc-list" class="pp-list" style="margin-top:var(--sp-3)"></div>

        <div class="rh" style="margin-top:var(--sp-5)">
          <h2>Pod preview</h2>
          <span class="stats">mimics the in-game grid — photo only, everything maxed to 99</span>
        </div>
        <div id="pp-grid"></div>
      </div>
    `;

    document.getElementById("pp-alloc-list").addEventListener("click", (e) => {
      const row = e.target.closest(".pp-row");
      if (!row) return;
      const name = row.dataset.name;
      const current = materials().find((m) => m.name === name);
      if (!current) return;
      if (e.target.classList.contains("pp-inc")) setSlots(name, current.slots + 1);
      else if (e.target.classList.contains("pp-dec")) setSlots(name, current.slots - 1);
      else if (e.target.classList.contains("pp-remove")) removeMaterial(name);
      else return;
      render();
    });

    document.getElementById("pp-add-btn").addEventListener("click", () => {
      const nameInput = document.getElementById("pp-add-name");
      const slotsInput = document.getElementById("pp-add-slots");
      addMaterial(nameInput.value, Number(slotsInput.value) || 1);
      nameInput.value = "";
      slotsInput.value = "1";
      render();
    });
    document.getElementById("pp-add-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("pp-add-btn").click();
    });

    document.getElementById("pp-reset").addEventListener("click", () => {
      if (!confirm("Reset every material back to its default slot count?")) return;
      resetToDefaults();
      render();
    });

    render();
  }

  return { init, _imgFail: imgFail };
})();
