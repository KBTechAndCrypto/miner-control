// Miner Control - colour themes (browser only, shared by index.html and widget.html).
// Each theme only swaps the accent colour family; layout and the warning / error colours stay readable.
// Choice is stored per device in localStorage "mc.theme"; the widget also accepts ?theme=<name>.
(function () {
  const THEMES = {
    green:  { g: '#39ff7a', dim: '#2fc466', mute: '#22994f', txt: '#b9ffd0', line: '#0f5f2c', lineHi: '#19c45a',
              bg: '#020604', panel: 'rgba(4,18,10,.82)', dlg: '#03100a', fill0: '#0e7a37', rgb: '57,255,122',
              wdim: '#1f9d4d', wmute: '#13693a' },
    // amber: the normal warning colour would look like the accent, so warnings turn orange-red here
    amber:  { g: '#ffb000', dim: '#d08f00', mute: '#9a6a00', txt: '#ffe2a8', line: '#5f4300', lineHi: '#c48a00',
              bg: '#060402', panel: 'rgba(18,12,4,.82)', dlg: '#100b03', fill0: '#7a5200', rgb: '255,176,0',
              wdim: '#a87400', wmute: '#6e4c00', warn: '#ff6a1a', orange: '#ff6a1a' },
    cyan:   { g: '#3fe8ff', dim: '#2fb8d0', mute: '#228a9e', txt: '#c2f6ff', line: '#0f4f5f', lineHi: '#19a8c4',
              bg: '#020506', panel: 'rgba(4,14,18,.82)', dlg: '#030c10', fill0: '#0e5f7a', rgb: '63,232,255',
              wdim: '#1f8fa6', wmute: '#13606e' },
    purple: { g: '#c77dff', dim: '#a062d6', mute: '#7a4aa6', txt: '#ecd6ff', line: '#3f1f5f', lineHi: '#8e4ec4',
              bg: '#050206', panel: 'rgba(13,4,18,.82)', dlg: '#0b0310', fill0: '#5a1e7a', rgb: '199,125,255',
              wdim: '#8a52b8', wmute: '#5c3680' }
  };
  const DEFAULT = 'green';
  function norm(n) { n = String(n || '').toLowerCase(); return THEMES[n] ? n : DEFAULT; }
  function get() { try { return norm(localStorage.getItem('mc.theme')); } catch { return DEFAULT; } }
  function save(n) { try { localStorage.setItem('mc.theme', norm(n)); } catch {} }
  const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  function apply(n) {
    const name = norm(n), p = THEMES[name], s = document.documentElement.style;
    const set = { '--g': p.g, '--g-dim': p.dim, '--g-mute': p.mute, '--txt': p.txt, '--line': p.line, '--line-hi': p.lineHi,
      '--bg': p.bg, '--panel': p.panel, '--dlg': p.dlg, '--fill0': p.fill0, '--g-rgb': p.rgb, '--line-rgb': rgbOf(p.line),
      '--dim': p.wdim, '--mute': p.wmute, '--warn': p.warn || '#ffb020', '--orange': p.orange || '#ff9f1c' };
    for (const k in set) s.setProperty(k, set[k]);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', p.bg);
    document.documentElement.dataset.theme = name;
    window.THEME = { name, ...p, bgRgb: rgbOf(p.bg) };
    return name;
  }
  window.MCTheme = { list: Object.keys(THEMES), norm, get, save, apply, DEFAULT };
  apply(get());   // as early as possible to avoid a green flash
})();
