// Small shared icon set (inline SVG, stroke-based, currentColor) used in place of emoji
// for structural/chrome UI — nav tabs, habitat badges, section headers, status glyphs.
// Sizing is controlled by font-size via the `.icon { width/height: 1em }` CSS rule, so
// icons scale naturally wherever they're dropped in.
const Icons = (() => {
  const raw = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    people: '<circle cx="8.5" cy="8" r="3.2"/><circle cx="16" cy="9.6" r="2.5"/><path d="M2.5 20c.6-3.6 2.9-5.5 6-5.5s5.3 1.9 6 5.5"/><path d="M14.5 20c.4-2.5 1.7-4.1 3.8-4.7"/>',
    chart: '<path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/>',
    decor: '<rect x="3" y="4.5" width="18" height="13" rx="2"/><circle cx="8" cy="9.5" r="1.4"/><path d="M21 14l-5-4.5L8 17"/>',
    relaxation: '<path d="M4.5 18v-4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4"/><path d="M4 18h16"/><path d="M5.5 12V9.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V12"/>',
    toy: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M8.5 14a4 4 0 0 0 7 0"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    bright: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M3 12h2.2M18.8 12H21M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
    dark: '<path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z"/>',
    warm: '<path d="M12.5 3a2 2 0 0 0-2 2v8.6a3.6 3.6 0 1 0 4 0V5a2 2 0 0 0-2-2Z"/><path d="M12.5 16.6V9"/>',
    cool: '<path d="M12 2v20"/><path d="M4.6 6.4l14.8 11.2"/><path d="M4.6 17.6L19.4 6.4"/>',
    humid: '<path d="M12 3.3s6.2 6.7 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10 12 3.3 12 3.3Z"/>',
    dry: '<circle cx="12" cy="8.5" r="3.4"/><path d="M3.2 20.5c1.9-3.2 5-4.8 8.8-4.8s6.9 1.6 8.8 4.8"/>',
    home: '<path d="M3.5 11L12 3l8.5 8"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10"/>',
    warning: '<path d="M12 3L22 20H2L12 3Z"/><path d="M12 9.8v4.2"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/>',
    check: '<polyline points="4.5 12.5 9.5 17.5 19.5 6.5"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
    link: '<path d="M7 17L17 7"/><path d="M8.5 7H17v8.5"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5.5a3 3 0 0 0 3 4"/><path d="M16 5h2.5a3 3 0 0 1-3 4"/><path d="M10 15.5V18h4v-2.5"/><path d="M9 21h6"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  };

  const HABITAT_KEY = { Bright: "bright", Dark: "dark", Warm: "warm", Cool: "cool", Humid: "humid", Dry: "dry" };

  function get(name, extraClass) {
    if (!(name in raw)) return "";
    const cls = extraClass ? `icon ${extraClass}` : "icon";
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw[name]}</svg>`;
  }

  function habitat(trait, extraClass) {
    return get(HABITAT_KEY[trait] || "", extraClass);
  }

  return { get, habitat };
})();
