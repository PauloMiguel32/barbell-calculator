(() => {
'use strict';
// [size, diameter mm, thickness mm, color]
const SETS = {
  lb: [[45,450,60,'#d92b2b'],[35,400,55,'#2f6fe0'],[25,340,45,'#e8b72e'],[15,280,35,'#2faa55'],[10,230,28,'#e5e9f0'],[5,180,22,'#8b95a5'],[2.5,150,16,'#b4bcc8']],
  kg: [[25,450,65,'#d92b2b'],[20,450,58,'#2f6fe0'],[15,450,50,'#e8b72e'],[10,450,42,'#2faa55'],[5,450,26,'#e5e9f0'],[2.5,230,20,'#8b95a5'],[1.25,180,14,'#b4bcc8']]
};
const BAR_OPTS = { lb: [45, 35], kg: [20, 15] };
const KEY = 'barbell-calculator-state';
let state = { unit: 'lb', bar: 45, text: '135, 225, 315', page: 'calc' };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && SETS[s.unit] && BAR_OPTS[s.unit].includes(s.bar) && typeof s.text === 'string') {
    state = { unit: s.unit, bar: s.bar, text: s.text.slice(0, 120), page: s.page === 'pct' ? 'pct' : 'calc' };
  }
} catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

const fmt = (n) => String(Math.round(n * 100) / 100);
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, a = Math.abs(f);
  return 'rgb(' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round((t - v) * a + v)).join(',') + ')';
};
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// Greedy plates for one side. Hundredths avoid float drift.
const loadFor = (w) => {
  let left = Math.round((w - state.bar) * 50);
  const counts = [];
  SETS[state.unit].forEach(([size, d, t, color]) => {
    const s = Math.round(size * 100), n = Math.floor(left / s);
    if (n > 0) { left -= n * s; counts.push({ n, size, d, t, color }); }
  });
  return { counts, left };
};

const plateHTML = (c) => {
  const bg = 'linear-gradient(180deg,' + shade(c.color, 0.35) + ' 0%,' + c.color + ' 40%,' + shade(c.color, -0.4) + ' 100%)';
  const h = (c.d * 100 / 2200).toFixed(2), w = (c.t * 1.2 * 100 / 2200).toFixed(2);
  const label = c.t >= 45 ? '<span style="color:' + (lum(c.color) > 0.6 ? '#101418' : '#fff') + '">' + fmt(c.size) + '</span>' : '';
  return '<div class="plate" style="width:' + w + 'cqw;height:' + h + 'cqw;background:' + bg + '">' + label + '<i></i></div>';
};

const barHTML = (counts) => {
  const list = [];
  counts.forEach((c) => { for (let i = 0; i < c.n; i++) list.push(c); });
  const right = list.map(plateHTML).join('');
  const left = list.slice().reverse().map(plateHTML).join('');
  return '<div class="bar"><div class="barrow">' +
    '<div class="sleeve"><div class="stub"></div>' + left + '<div class="collar"></div></div>' +
    '<div class="shaft"></div>' +
    '<div class="sleeve"><div class="collar"></div>' + right + '<div class="stub"></div></div>' +
    '</div></div>';
};

const parseNums = () => state.text.split(/[\s,;]+/).filter(Boolean).map(Number).filter((n) => isFinite(n) && n > 0).slice(0, 12);

const cardHTML = (w) => {
  const { unit, bar } = state;
  const label = '<b class="cond">' + fmt(w) + ' ' + unit + '</b>';
  if (w < bar) {
    return '<section class="card"><div class="top">' + label + '</div><span class="warn">Lighter than the ' + bar + ' ' + unit + ' bar. Enter ' + bar + ' or more.</span></section>';
  }
  const { counts, left } = loadFor(w);
  const total = counts.reduce((a, c) => a + c.n * 2, 0);
  const barOnly = counts.length === 0 && left === 0;
  const side = fmt((w - bar) / 2 - left / 100) + ' ' + unit;
  const pill = barOnly ? 'Empty bar. No plates needed.' : 'Plates per side: ' + counts.map((c) => c.n + '\u00d7 ' + fmt(c.size) + unit).join(', ');
  const rem = left > 0 ? '<span class="warn">Cannot be loaded exactly with these plates. Closest below: ' + fmt(w - left * 2 / 100) + ' ' + unit + '.</span>' : '';
  return '<section class="card"><div class="top">' + label + '<span>' + (barOnly ? 'Bar only' : total + ' plates') + '</span></div>' +
    '<div class="cap" style="margin-top:4px">Weight Per Side</div><div class="big cond">' + side + '</div>' +
    barHTML(counts) +
    '<div class="cap">' + bar + ' ' + unit + ' Olympic bar</div><div class="pill">' + pill + '</div>' + rem + '</section>';
};

const calcHTML = () => {
  const nums = parseNums();
  const chips = SETS[state.unit].map(([size, , , color]) => '<span class="chip"><i style="background:' + color + '"></i>' + fmt(size) + ' ' + state.unit + '</span>').join('');
  let html = '<div><div class="head">Plate Color Guide</div><div class="chips">' + chips + '</div></div>';
  if (!nums.length) return html + '<p class="msg">Type one or more weights to see the plates for each side.</p>';
  html += '<div class="count">Showing ' + nums.length + (nums.length === 1 ? ' weight' : ' weights') + '</div>';
  return html + nums.map(cardHTML).join('');
};

const pctHTML = () => {
  const nums = parseNums(), { unit, bar } = state;
  const msg = (t) => '<p class="msg">' + t + '</p>';
  if (!nums.length) return msg('Type a weight to see its percentages.');
  if (nums.length > 1) return msg('Percentages need a single weight. You have ' + nums.length + ' weights in the box. Keep just one to see its percentages.');
  const W = nums[0];
  if (W < bar) return msg('Enter a weight of at least ' + bar + ' ' + unit + ' (the bar) to see percentages.');
  const inc = unit === 'lb' ? 5 : 2.5, title = fmt(W) + ' ' + unit;
  let rows = '';
  for (let p = 100; p >= 30; p -= 5) {
    const raw = W * p / 100;
    let weight, plates;
    if (raw < bar) { weight = fmt(raw) + ' ' + unit; plates = 'Below the bar'; }
    else {
      const load = bar + Math.round((raw - bar) / inc) * inc;
      const { counts } = loadFor(load);
      weight = (Math.abs(raw - load) > 0.001 ? '\u2248 ' : '') + fmt(load) + ' ' + unit;
      plates = counts.length ? counts.map((c) => (c.n > 1 ? c.n + '\u00d7 ' : '') + fmt(c.size)).join(' + ') : 'Bar only';
    }
    rows += '<div class="grid' + (p === 100 ? ' hl' : '') + '"><span class="p cond"' + (p === 100 ? ' style="color:var(--accent)"' : '') + '>' + p + '%</span><span class="wt cond">' + weight + '</span><span class="pl">' + plates + '</span></div>';
  }
  return '<section class="card" style="padding-bottom:8px;gap:0"><div class="cap">Percentages of</div><div class="big cond" style="margin-bottom:12px">' + title + '</div>' +
    '<div class="grid h"><span>%</span><span>Weight</span><span>Plates per side</span></div>' + rows +
    '<p class="note">Percentages are of ' + title + ' on a ' + bar + ' ' + unit + ' bar. Weights are rounded to the nearest loadable amount (' + fmt(inc) + ' ' + unit + ' steps). \u2248 means rounded.</p></section>';
};

const segHTML = (items) => items.map((i) => '<button type="button" data-a="' + i.a + '" data-v="' + i.v + '" aria-pressed="' + i.on + '">' + i.label + '</button>').join('');
const $ = (id) => document.getElementById(id);

const renderControls = () => {
  $('units').innerHTML = segHTML(['lb', 'kg'].map((u) => ({ a: 'unit', v: u, label: u, on: u === state.unit })));
  $('bars').innerHTML = segHTML(BAR_OPTS[state.unit].map((b) => ({ a: 'bar', v: b, label: b + ' ' + state.unit, on: b === state.bar })));
  $('tabs').innerHTML = segHTML([{ a: 'page', v: 'calc', label: 'Calculator', on: state.page === 'calc' }, { a: 'page', v: 'pct', label: 'Percentages', on: state.page === 'pct' }]);
};
const renderMain = () => { $('main').innerHTML = state.page === 'calc' ? calcHTML() : pctHTML(); };
const render = () => { renderControls(); renderMain(); };

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const { a, v } = b.dataset;
  if (a === 'unit') { state.unit = v; state.bar = BAR_OPTS[v][0]; }
  else if (a === 'bar') state.bar = Number(v);
  else if (a === 'page') { state.page = v; window.scrollTo(0, 0); }
  save(); render();
});
$('w').value = state.text;
$('w').addEventListener('input', (e) => { state.text = e.target.value.slice(0, 120); save(); renderMain(); });
render();

// Install prompt (Android/Chrome) and iPhone hint
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').style.display = 'inline-block'; });
$('install').addEventListener('click', async () => {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice.catch(() => {});
  deferred = null; $('install').style.display = 'none';
});
window.addEventListener('appinstalled', () => { $('install').style.display = 'none'; });
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('ios').style.display = 'block';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
