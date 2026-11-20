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
    state = { unit: s.unit, bar: s.bar, text: s.text.slice(0, 120), page: ['pct', 'ladder'].includes(s.page) ? s.page : 'calc' };
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

// Ladder planner: picks the plate combination at each step that needs the fewest plate moves from the previous step.
const ladderData = (nums, plates, bar, unit, fmt) => {
  const L = { ok: false, hasMsg: false, msg: '', steps: [], big: '', summary: '' };
  if (nums.length < 2) { L.hasMsg = true; L.msg = 'A ladder needs at least 2 weights, in the order you lift them. Type them in the box, for example 135, 155, 175, 195.'; return L; }
  const sizes = plates.map((p) => Math.round(p[0] * 100));
  const sum = (v) => v.reduce((a, b) => a + b, 0);
  const cost = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
  const enumerate = (target) => {
    const out = [], cur = new Array(sizes.length).fill(0);
    const rec = (i, rem, used) => {
      if (out.length >= 3000) return;
      if (i === sizes.length) { if (rem === 0) out.push(cur.slice()); return; }
      const max = Math.min(Math.floor(rem / sizes[i]), 10 - used);
      for (let n = max; n >= 0; n--) { cur[i] = n; rec(i + 1, rem - n * sizes[i], used + n); }
      cur[i] = 0;
    };
    rec(0, target, 0);
    out.sort((a, b) => sum(a) - sum(b));
    return out.slice(0, 300);
  };
  const cands = [], greedy = [];
  for (let i = 0; i < nums.length; i++) {
    const w = nums[i];
    const target = Math.round((w - bar) * 50);
    const list = w < bar ? [] : enumerate(target);
    if (!list.length) {
      L.hasMsg = true;
      L.msg = fmt(w) + ' ' + unit + (w < bar ? ' is lighter than the bar.' : ' cannot be loaded exactly with these plates.') + ' Fix or remove it to see the ladder.';
      return L;
    }
    cands.push(list);
    let rem = target;
    const g = sizes.map((s) => { const n = Math.floor(rem / s); rem -= n * s; return n; });
    greedy.push(rem === 0 ? g : list[0]);
  }
  const layers = [];
  let prev = cands[0].map((v) => ({ c: sum(v) * 1.001, f: -1 }));
  layers.push(prev);
  for (let k = 1; k < cands.length; k++) {
    const cur = cands[k].map((v) => {
      let best = Infinity, bi = 0;
      for (let j = 0; j < cands[k - 1].length; j++) {
        const c = prev[j].c + cost(cands[k - 1][j], v);
        if (c < best) { best = c; bi = j; }
      }
      return { c: best + sum(v) * 0.001, f: bi };
    });
    layers.push(cur);
    prev = cur;
  }
  let bi = 0;
  prev.forEach((s, i) => { if (s.c < prev[bi].c) bi = i; });
  const pick = new Array(cands.length);
  for (let k = cands.length - 1; k >= 0; k--) { pick[k] = bi; bi = layers[k][bi].f; }
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  let before = new Array(sizes.length).fill(0), total = 0, base = 0, gb = before;
  greedy.forEach((v) => { base += cost(gb, v); gb = v; });
  for (let k = 0; k < cands.length; k++) {
    const v = cands[k][pick[k]], moves = [];
    let n = 0;
    plates.forEach(([size], i) => {
      const d = v[i] - before[i];
      if (d > 0) moves.push({ text: '+ ' + (d > 1 ? d + '\u00d7 ' : '') + fmt(size), bg: '#0d2a1a', fg: '#5eea9a' });
      else if (d < 0) moves.push({ text: '\u2212 ' + (-d > 1 ? -d + '\u00d7 ' : '') + fmt(size), bg: '#2d1114', fg: '#ff7b7b' });
      n += Math.abs(d);
    });
    const chips = [];
    plates.forEach(([size, , , color], i) => { if (v[i]) chips.push({ text: (v[i] > 1 ? v[i] + '\u00d7 ' : '') + fmt(size), color }); });
    L.steps.push({
      title: k === 0 ? 'Start' : 'Step ' + (k + 1),
      weight: fmt(nums[k]) + ' ' + unit,
      label: k === 0 ? 'Load on each side' : 'Change on each side',
      moves, chips, count: n,
      countText: plural(n, 'plate move'),
      note: n === 0 ? (k === 0 ? 'Empty bar' : 'No change') : ''
    });
    total += n; before = v;
  }
  L.ok = true;
  L.big = plural(total, 'move');
  const saved = base - total;
  L.summary = 'Standard loading would take ' + plural(base, 'move') + ' per side. ' + (saved > 0 ? 'This ladder saves ' + saved + ' per side.' : 'Standard loading is already the fastest for this ladder.');
  return L;
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


const ladderHTML = () => {
  const L = ladderData(parseNums(), SETS[state.unit], state.bar, state.unit, fmt);
  if (L.hasMsg) return '<p class="msg">' + L.msg + '</p>';
  const centered = ' style="justify-content:center;margin-top:0"';
  const summary = '<section class="card"><div class="cap">Fastest ladder</div><div class="big cond">' + L.big + '</div>' +
    '<div class="cap">Per side, whole ladder</div><p style="margin:0;text-align:center;font-size:13px;line-height:1.5;color:var(--muted)">' + L.summary + '</p></section>';
  const steps = L.steps.map((s) => {
    const mv = s.moves.map((m) => '<span class="mv" style="background:' + m.bg + ';color:' + m.fg + '">' + m.text + '</span>').join('') +
      (s.note ? '<span class="mv" style="background:#0a1224;color:#c9d3e6">' + s.note + '</span>' : '');
    const on = s.chips.length ? '<div class="cap">On each side now</div><div class="chips"' + centered + '>' +
      s.chips.map((c) => '<span class="chip"><i style="background:' + c.color + '"></i>' + c.text + '</span>').join('') + '</div>' : '';
    return '<section class="card"><div class="top"><b class="cond">' + s.title + '</b><span>' + s.countText + '</span></div>' +
      '<div class="big cond" style="font-size:40px">' + s.weight + '</div>' +
      '<div class="cap">' + s.label + '</div><div class="chips"' + centered + '>' + mv + '</div>' + on + '</section>';
  }).join('');
  return summary + steps + '<p class="note" style="margin:0 4px">Plates are per side. Make the same change on both ends of the bar. The plan picks the plate mix that needs the fewest changes from one step to the next, so a step can use more plates than standard loading.</p>';
};

const segHTML = (items) => items.map((i) => '<button type="button" data-a="' + i.a + '" data-v="' + i.v + '" aria-pressed="' + i.on + '">' + i.label + '</button>').join('');
const $ = (id) => document.getElementById(id);

const renderControls = () => {
  $('units').innerHTML = segHTML(['lb', 'kg'].map((u) => ({ a: 'unit', v: u, label: u, on: u === state.unit })));
  $('bars').innerHTML = segHTML(BAR_OPTS[state.unit].map((b) => ({ a: 'bar', v: b, label: b + ' ' + state.unit, on: b === state.bar })));
  $('tabs').innerHTML = segHTML([{ a: 'page', v: 'calc', label: 'Calculator', on: state.page === 'calc' }, { a: 'page', v: 'pct', label: 'Percentages', on: state.page === 'pct' }, { a: 'page', v: 'ladder', label: 'Ladder', on: state.page === 'ladder' }]);
};
const renderMain = () => { $('main').innerHTML = state.page === 'pct' ? pctHTML() : state.page === 'ladder' ? ladderHTML() : calcHTML(); };
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

// Install button: uses the browser's install prompt when it is available, otherwise shows the steps.
let deferred = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const btn = $('install'), help = $('help');
if (standalone) btn.style.display = 'none';
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
btn.addEventListener('click', async () => {
  if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; return; }
  help.innerHTML = isIOS
    ? 'iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>, then <b>Add</b>.'
    : 'Android: tap the browser menu (3 dots), then <b>Install app</b> or <b>Add to Home screen</b>. If you do not see it, open this page in Chrome, not inside Facebook or Messenger.';
  help.style.display = help.style.display === 'block' ? 'none' : 'block';
});
window.addEventListener('appinstalled', () => { btn.style.display = 'none'; help.style.display = 'none'; });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
