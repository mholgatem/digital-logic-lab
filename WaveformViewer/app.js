// ---------------------------------------------------------------------------
// Theme / cookie boilerplate (same pattern used by every Digital Logic Lab
// module — see CLAUDE.md: utilities are intentionally duplicated per module).
// ---------------------------------------------------------------------------
const THEME_COOKIE = 'dll_theme';

function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.remove('light');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = true;
  } else {
    document.body.classList.add('light');
    document.body.classList.remove('dark');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = false;
  }
}

function initTheme() {
  const savedTheme = getCookie(THEME_COOKIE) || 'light';
  applyTheme(savedTheme);
}

// ---------------------------------------------------------------------------
// Constants and global state
// ---------------------------------------------------------------------------
const WP = window.WaveParsers;

const ROW_H = 24;
const RULER_H = 28;
const SCROLLBAR_W = 12;
const MAX_DEFAULT_TRACES = 64;
const MIN_TIME_PER_PX = 0.005;

const EXAMPLES = [
  {
    title: '4-bit counter',
    sub: 'VCD · clock, reset, enable and a counting bus',
    files: ['counter.vcd'],
  },
  {
    title: '4-to-1 multiplexer',
    sub: 'FST · every data/select combination',
    files: ['mux4.fst'],
  },
  {
    title: 'Traffic light FSM',
    sub: 'VCD + .gtkw · labels, blanks and groups',
    files: ['traffic_fsm.vcd', 'traffic_fsm.gtkw'],
  },
];

/** Single source of truth for the viewer; rendering is driven from it. */
const state = {
  wave: null,
  traces: [],
  view: { t0: 0, timePerPx: 1 },
  cursor: null,
  marker: null,
  selection: new Set(),
  selectionAnchor: null,
  scrollY: 0,
  warnings: [],
  treeExpanded: new Set(),
  treeSelection: new Set(),
  treeAnchor: null,
  pendingGtkw: null,
};

let nextTraceId = 1;
let colors = {};
let renderQueued = false;
let visibleCache = null;

const el = {};

function $(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Trace helpers
// ---------------------------------------------------------------------------
function makeTrace(fields) {
  return Object.assign({ id: nextTraceId++ }, fields);
}

function signalTrace(sigIndex) {
  const sig = state.wave.signals[sigIndex];
  return makeTrace({
    type: 'signal',
    name: sig.fullName,
    signal: sigIndex,
    alias: null,
    radix: sig.kind === 'bit' ? 'bin' : 'hex',
    invert: false,
    warning: null,
  });
}

function traceSignal(t) {
  if (!t || t.type !== 'signal' || t.signal === null || t.signal === undefined || !state.wave) {
    return null;
  }
  return state.wave.signals[t.signal] || null;
}

/** Index of the groupEnd matching the groupStart at `start` (or the last index). */
function groupEndIndex(start) {
  let depth = 0;
  for (let i = start; i < state.traces.length; i++) {
    const t = state.traces[i];
    if (t.type === 'groupStart') depth++;
    else if (t.type === 'groupEnd' && --depth === 0) return i;
  }
  return state.traces.length - 1;
}

/** Rows that are shown: collapsed groups hide their contents, group ends are never shown. */
function visibleRows() {
  if (visibleCache) return visibleCache;
  const rows = [];
  let depth = 0;
  for (let i = 0; i < state.traces.length; i++) {
    const t = state.traces[i];
    if (t.type === 'groupEnd') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    rows.push({ trace: t, index: i, depth });
    if (t.type === 'groupStart') {
      if (t.collapsed) i = groupEndIndex(i);
      else depth++;
    }
  }
  visibleCache = rows;
  return rows;
}

function tracesChanged() {
  visibleCache = null;
  const ids = new Set(state.traces.map((t) => t.id));
  for (const id of [...state.selection]) {
    if (!ids.has(id)) state.selection.delete(id);
  }
  renderRows();
  updateToolbar();
  requestRender();
}

function selectedIndices() {
  const out = [];
  state.traces.forEach((t, i) => {
    if (state.selection.has(t.id)) out.push(i);
  });
  return out;
}

/** Selected trace indices, with collapsed groups expanded to their whole block. */
function selectedBlocks() {
  const set = new Set();
  for (const i of selectedIndices()) {
    const t = state.traces[i];
    if (t.type === 'groupStart') {
      const end = groupEndIndex(i);
      for (let k = i; k <= end; k++) set.add(k);
    } else {
      set.add(i);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function selectedSignalTraces() {
  return state.traces.filter((t) => state.selection.has(t.id) && t.type === 'signal');
}

// ---------------------------------------------------------------------------
// View / time helpers
// ---------------------------------------------------------------------------
function waveWidth() {
  return Math.max(10, el.waveCol.clientWidth - SCROLLBAR_W);
}

function waveHeight() {
  return el.waveCol.clientHeight;
}

function timeSpan() {
  if (!state.wave) return 1;
  return Math.max(1, state.wave.endTime - state.wave.startTime);
}

function toX(t) {
  return (t - state.view.t0) / state.view.timePerPx;
}

function timeAtX(x) {
  return state.view.t0 + x * state.view.timePerPx;
}

function fmtTime(t) {
  return WP.formatTime(t, state.wave ? state.wave.timescaleExp : -9);
}

function maxTimePerPx() {
  return (timeSpan() * 4) / waveWidth();
}

function clampView() {
  if (!state.wave) return;
  const v = state.view;
  v.timePerPx = Math.min(maxTimePerPx(), Math.max(MIN_TIME_PER_PX, v.timePerPx));
  const visible = v.timePerPx * waveWidth();
  const start = state.wave.startTime;
  const maxT0 = Math.max(start, state.wave.endTime - visible * 0.5);
  v.t0 = Math.min(maxT0, Math.max(start, v.t0));
}

function setView(t0, timePerPx) {
  state.view.t0 = t0;
  state.view.timePerPx = timePerPx;
  clampView();
  syncHScroll();
  requestRender();
}

function zoomAt(factor, x) {
  if (!state.wave) return;
  const anchor = timeAtX(x);
  const tpp = Math.min(maxTimePerPx(), Math.max(MIN_TIME_PER_PX, state.view.timePerPx * factor));
  setView(anchor - x * tpp, tpp);
}

function zoomCentered(factor) {
  const w = waveWidth();
  let x = w / 2;
  if (state.cursor !== null) {
    const cx = toX(state.cursor);
    if (cx >= 0 && cx <= w) x = cx;
  }
  zoomAt(factor, x);
}

function zoomFit() {
  if (!state.wave) return;
  setView(state.wave.startTime, timeSpan() / (waveWidth() - 8));
}

function zoomToRange(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo <= 0) return;
  const pad = (hi - lo) * 0.05;
  setView(lo - pad, (hi - lo + 2 * pad) / waveWidth());
}

function zoomToMarkers() {
  if (state.cursor === null || state.marker === null) {
    showToast('Place both the cursor (click) and the marker (right-click) first.');
    return;
  }
  if (state.cursor === state.marker) return;
  zoomToRange(state.cursor, state.marker);
}

function panBy(px) {
  setView(state.view.t0 + px * state.view.timePerPx, state.view.timePerPx);
}

function ensureVisible(t) {
  const x = toX(t);
  const w = waveWidth();
  if (x < 0 || x > w) setView(t - (w / 2) * state.view.timePerPx, state.view.timePerPx);
}

function syncHScroll() {
  if (!state.wave) return;
  const visible = state.view.timePerPx * waveWidth();
  const start = state.wave.startTime;
  const maxT0 = Math.max(start, state.wave.endTime - visible * 0.5);
  el.hScroll.value = maxT0 > start ? Math.round(((state.view.t0 - start) / (maxT0 - start)) * 1000) : 0;
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------
function readColors() {
  const cs = getComputedStyle(document.body);
  const v = (name) => cs.getPropertyValue(name).trim();
  colors = {
    bg: v('--wave-bg'),
    bit: v('--wave-bit'),
    cursor: v('--wave-cursor'),
    grid: v('--wave-grid'),
    group: v('--wave-group'),
    marker: v('--wave-marker'),
    muted: v('--muted'),
    ruler: v('--wave-ruler'),
    border: v('--border'),
    select: v('--wave-select'),
    text: v('--wave-text'),
    vec: v('--wave-vec'),
    vecFill: v('--wave-vec-fill'),
    x: v('--wave-x'),
    z: v('--wave-z'),
    primary: v('--primary'),
  };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = el.waveCol.clientWidth;
  const h = el.waveCol.clientHeight;
  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  clampView();
  syncHScroll();
  updateVScroll();
  requestRender();
}

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawCanvas();
  });
}

/** A "nice" step (1, 2 or 5 × 10^k) at least `min`. */
function niceStep(min) {
  const p = Math.pow(10, Math.floor(Math.log10(min)));
  for (const m of [1, 2, 5, 10]) {
    if (m * p >= min) return m * p;
  }
  return 10 * p;
}

let rulerDrag = null;

function drawCanvas() {
  const ctx = el.canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = el.canvas.width / dpr;
  const H = el.canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);
  if (!state.wave) return;

  const ww = waveWidth();
  ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
  ctx.textBaseline = 'middle';

  // Ruler ticks and grid.
  const step = niceStep(Math.max(80 * state.view.timePerPx, 1e-9));
  const first = Math.ceil(state.view.t0 / step) * step;
  ctx.fillStyle = colors.ruler;
  ctx.fillRect(0, 0, W, RULER_H);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = first; toX(t) <= ww; t += step) {
    const x = Math.round(toX(t)) + 0.5;
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x, H);
  }
  ctx.stroke();

  // Rows.
  const rows = visibleRows();
  const firstRow = Math.max(0, Math.floor(state.scrollY / ROW_H));
  const lastRow = Math.min(rows.length - 1, Math.ceil((state.scrollY + H - RULER_H) / ROW_H));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_H, ww, H - RULER_H);
  ctx.clip();
  for (let r = firstRow; r <= lastRow; r++) {
    const row = rows[r];
    const y = RULER_H + r * ROW_H - state.scrollY;
    if (state.selection.has(row.trace.id)) {
      ctx.fillStyle = colors.select;
      ctx.fillRect(0, y, ww, ROW_H);
    } else if (row.trace.type === 'groupStart') {
      ctx.fillStyle = colors.group;
      ctx.fillRect(0, y, ww, ROW_H);
    }
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(0, y + ROW_H - 0.5);
    ctx.lineTo(ww, y + ROW_H - 0.5);
    ctx.stroke();
    if (row.trace.type === 'signal') drawSignalRow(ctx, row.trace, y, ww);
  }
  ctx.restore();

  drawRuler(ctx, W, step, first, ww);
  drawTimeLines(ctx, H, ww);
}

function drawRuler(ctx, W, step, first, ww) {
  ctx.strokeStyle = colors.border;
  ctx.beginPath();
  ctx.moveTo(0, RULER_H - 0.5);
  ctx.lineTo(W, RULER_H - 0.5);
  ctx.stroke();
  ctx.fillStyle = colors.muted;
  ctx.strokeStyle = colors.muted;
  ctx.textAlign = 'left';
  ctx.beginPath();
  for (let t = first; toX(t) <= ww; t += step) {
    const x = Math.round(toX(t)) + 0.5;
    ctx.moveTo(x, RULER_H - 7);
    ctx.lineTo(x, RULER_H);
    ctx.fillText(fmtTime(t), x + 3, 10);
  }
  // Minor ticks.
  const minor = step / 5;
  for (let t = Math.ceil(state.view.t0 / minor) * minor; toX(t) <= ww; t += minor) {
    const x = Math.round(toX(t)) + 0.5;
    ctx.moveTo(x, RULER_H - 3);
    ctx.lineTo(x, RULER_H);
  }
  ctx.stroke();

  if (rulerDrag && Math.abs(rulerDrag.x1 - rulerDrag.x0) > 2) {
    const xa = Math.min(rulerDrag.x0, rulerDrag.x1);
    ctx.fillStyle = colors.select;
    ctx.fillRect(xa, 0, Math.abs(rulerDrag.x1 - rulerDrag.x0), el.canvas.height);
    ctx.strokeStyle = colors.primary;
    ctx.strokeRect(xa + 0.5, 0.5, Math.abs(rulerDrag.x1 - rulerDrag.x0), RULER_H - 1);
  }
}

function drawTimeLines(ctx, H, ww) {
  const drawLine = (t, color, dashed) => {
    const x = Math.round(toX(t)) + 0.5;
    if (x < 0 || x > ww) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (state.marker !== null) drawLine(state.marker, colors.marker, true);
  if (state.cursor !== null) drawLine(state.cursor, colors.cursor, false);

  if (state.cursor !== null && state.marker !== null && state.cursor !== state.marker) {
    const xa = toX(Math.min(state.cursor, state.marker));
    const xb = toX(Math.max(state.cursor, state.marker));
    const text = 'Δ ' + fmtTime(Math.abs(state.cursor - state.marker));
    const tw = ctx.measureText(text).width + 10;
    let cx = (Math.max(xa, 0) + Math.min(xb, ww)) / 2;
    cx = Math.min(ww - tw / 2, Math.max(tw / 2, cx));
    ctx.fillStyle = colors.marker;
    ctx.fillRect(cx - tw / 2, RULER_H - 13, tw, 13);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, RULER_H - 6);
    ctx.textAlign = 'left';
  }
}

/**
 * Walks the value changes of `d` visible in the canvas and calls
 * cb(xa, xb, value, dense). Several changes that fall into one pixel are
 * merged into a single dense block so huge files stay fast to draw.
 */
function forEachSegment(d, ww, cb) {
  const times = d.times;
  const values = d.values;
  const n = times.length;
  if (!n) return;
  const tpp = state.view.timePerPx;
  const t0 = state.view.t0;
  const endX = toX(state.wave.endTime);
  let i = Math.max(0, WP.changeIndexAt(times, t0));
  let xa = Math.max(toX(times[i]), -2);
  while (i < n && xa <= ww) {
    const xb = i + 1 < n ? toX(times[i + 1]) : Math.max(endX, xa);
    if (i + 1 >= n || xb - xa >= 1) {
      if (xb > xa || i + 1 >= n) cb(xa, Math.min(xb, ww + 2), values[i], false);
      i++;
      xa = xb;
      continue;
    }
    let px = Math.floor(xa) + 1;
    let k = WP.changeIndexAt(times, t0 + px * tpp);
    while (k + 1 < n && toX(times[k + 1]) < px + 1 && px <= ww) {
      px++;
      k = WP.changeIndexAt(times, t0 + px * tpp);
    }
    cb(Math.floor(xa), px, values[k], true);
    i = k;
    xa = px;
    if (k + 1 >= n) {
      cb(px, Math.min(Math.max(endX, px), ww + 2), values[k], false);
      break;
    }
  }
}

function invertBits(v) {
  return v.replace(/[01]/g, (c) => (c === '0' ? '1' : '0'));
}

function drawSignalRow(ctx, trace, y, ww) {
  const sig = traceSignal(trace);
  if (!sig) {
    ctx.fillStyle = colors.muted;
    ctx.fillText(trace.warning || 'Signal not found', 8, y + ROW_H / 2);
    return;
  }
  const d = state.wave.data[sig.handle];
  const hi = y + 5;
  const lo = y + ROW_H - 5;
  const mid = (hi + lo) / 2;
  ctx.lineWidth = 1.5;

  if (sig.kind === 'bit' && sig.width === 1) {
    let prevY = null;
    forEachSegment(d, ww, (xa, xb, value, dense) => {
      if (dense) {
        ctx.fillStyle = colors.bit;
        ctx.fillRect(xa, hi, Math.max(1, xb - xa), lo - hi);
        prevY = null;
        return;
      }
      let v = value;
      if (trace.invert) v = invertBits(v);
      if (v === '1' || v === 'h') drawBitLevel(ctx, xa, xb, hi, colors.bit, prevY);
      else if (v === '0' || v === 'l') drawBitLevel(ctx, xa, xb, lo, colors.bit, prevY);
      else if (v === 'z') drawBitLevel(ctx, xa, xb, mid, colors.z, prevY);
      else drawUnknown(ctx, xa, xb, hi, lo);
      prevY = v === '1' || v === 'h' ? hi : v === '0' || v === 'l' ? lo : v === 'z' ? mid : null;
    });
    return;
  }

  // Buses, reals and strings are drawn as value boxes.
  forEachSegment(d, ww, (xa, xb, value, dense) => {
    if (dense) {
      ctx.fillStyle = colors.vec;
      ctx.fillRect(xa, hi, Math.max(1, xb - xa), lo - hi);
      return;
    }
    let v = value;
    if (trace.invert && typeof v === 'string' && sig.kind !== 'string') v = invertBits(v);
    const isVec = typeof v === 'string' && sig.kind !== 'string';
    if (isVec && /^z+$/.test(v)) {
      drawBitLevel(ctx, xa, xb, mid, colors.z, null);
      return;
    }
    if (isVec && /[xuw-]/.test(v)) {
      drawUnknown(ctx, xa, xb, hi, lo);
      drawBoxText(ctx, WP.formatValue(v, sig, trace.radix), xa, xb, mid, colors.x);
      return;
    }
    drawHexagon(ctx, xa, xb, hi, lo, colors.vec, colors.vecFill);
    drawBoxText(ctx, WP.formatValue(v, sig, trace.radix), xa, xb, mid, colors.text);
  });
}

function drawBitLevel(ctx, xa, xb, yLevel, color, prevY) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  if (prevY !== null && prevY !== yLevel) {
    ctx.moveTo(xa, prevY);
    ctx.lineTo(xa, yLevel);
  } else {
    ctx.moveTo(xa, yLevel);
  }
  ctx.lineTo(xb, yLevel);
  ctx.stroke();
}

function drawUnknown(ctx, xa, xb, hi, lo) {
  const w = xb - xa;
  if (w <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(xa, hi, w, lo - hi);
  ctx.clip();
  ctx.strokeStyle = colors.x;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  const h = lo - hi;
  const startX = Math.floor(xa / 6) * 6 - h;
  for (let x = startX; x < xb; x += 6) {
    ctx.moveTo(x, lo);
    ctx.lineTo(x + h, hi);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = colors.x;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(xa, hi, w, lo - hi);
}

function drawHexagon(ctx, xa, xb, hi, lo, stroke, fill) {
  const w = xb - xa;
  const s = Math.min(3, w / 2);
  const mid = (hi + lo) / 2;
  ctx.beginPath();
  ctx.moveTo(xa, mid);
  ctx.lineTo(xa + s, hi);
  ctx.lineTo(xb - s, hi);
  ctx.lineTo(xb, mid);
  ctx.lineTo(xb - s, lo);
  ctx.lineTo(xa + s, lo);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

let charWidth = 0;

function drawBoxText(ctx, text, xa, xb, mid, color) {
  if (!text) return;
  if (!charWidth) charWidth = ctx.measureText('0').width || 7;
  const left = Math.max(xa, 0) + 5;
  const avail = Math.min(xb, waveWidth()) - left - 4;
  if (avail < charWidth) return;
  let shown = text;
  if (text.length * charWidth > avail) {
    const n = Math.floor(avail / charWidth) - 1;
    if (n < 1) return;
    shown = text.slice(0, n) + '…';
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(shown, left, mid + 0.5);
}

// ---------------------------------------------------------------------------
// Names / values columns
// ---------------------------------------------------------------------------
function traceDisplayName(t) {
  switch (t.type) {
    case 'blank':
      return '';
    case 'label':
      return t.text;
    case 'groupStart':
      return t.name;
    case 'signal': {
      if (t.alias) return t.alias;
      const sig = traceSignal(t);
      return sig ? sig.name : t.name;
    }
    default:
      return '';
  }
}

function renderRows() {
  const rows = visibleRows();
  el.namesRows.textContent = '';
  el.valuesRows.textContent = '';
  const namesFrag = document.createDocumentFragment();
  const valuesFrag = document.createDocumentFragment();
  rows.forEach((row, r) => {
    const t = row.trace;
    const nameRow = document.createElement('div');
    nameRow.className = 'trace-row';
    nameRow.dataset.row = r;
    nameRow.setAttribute('role', 'option');
    if (row.depth) nameRow.classList.add('indent-' + Math.min(3, row.depth));
    if (state.selection.has(t.id)) nameRow.classList.add('selected');
    nameRow.setAttribute('aria-selected', state.selection.has(t.id) ? 'true' : 'false');

    if (t.type === 'groupStart') {
      nameRow.classList.add('is-group');
      const caret = document.createElement('span');
      caret.className = 'group-caret';
      caret.textContent = t.collapsed ? '▸' : '▾';
      caret.dataset.toggle = '1';
      nameRow.appendChild(caret);
    } else if (t.type === 'label') {
      nameRow.classList.add('is-label');
    }

    const name = document.createElement('span');
    name.className = 'trace-name';
    name.textContent = traceDisplayName(t);
    nameRow.appendChild(name);

    if (t.type === 'signal') {
      const sig = traceSignal(t);
      if (!sig) nameRow.classList.add('is-missing');
      nameRow.title = sig ? sig.fullName + (t.alias ? ' (alias: ' + t.alias + ')' : '') : t.name;
      if (t.warning) {
        const warn = document.createElement('span');
        warn.className = 'warn-badge';
        warn.textContent = '⚠';
        warn.title = t.warning;
        nameRow.appendChild(warn);
      }
      if (sig && !(sig.kind === 'bit' && sig.width === 1) && sig.kind !== 'real' && sig.kind !== 'string') {
        const badge = document.createElement('span');
        badge.className = 'radix-badge';
        badge.textContent = (t.invert ? '~' : '') + radixShort(t.radix);
        nameRow.appendChild(badge);
      } else if (sig && t.invert) {
        const badge = document.createElement('span');
        badge.className = 'radix-badge';
        badge.textContent = '~';
        nameRow.appendChild(badge);
      }
    }
    namesFrag.appendChild(nameRow);

    const valueRow = document.createElement('div');
    valueRow.className = 'trace-row';
    if (state.selection.has(t.id)) valueRow.classList.add('selected');
    valuesFrag.appendChild(valueRow);
  });
  el.namesRows.appendChild(namesFrag);
  el.valuesRows.appendChild(valuesFrag);
  updateValues();
  updateVScroll();
}

function radixShort(radix) {
  return { hex: 'hex', dec: 'dec', signed: '±dec', bin: 'bin', oct: 'oct', ascii: 'asc' }[radix] || 'hex';
}

function updateValues() {
  const rows = visibleRows();
  const cells = el.valuesRows.children;
  for (let r = 0; r < rows.length && r < cells.length; r++) {
    const t = rows[r].trace;
    let text = '';
    const sig = traceSignal(t);
    if (sig && state.cursor !== null) {
      let v = WP.valueAt(state.wave, sig, state.cursor);
      if (t.invert && typeof v === 'string' && sig.kind !== 'string') v = invertBits(v);
      text = WP.formatValue(v, sig, t.radix);
    }
    cells[r].textContent = text;
    cells[r].title = text;
  }
}

function updateSelectionClasses() {
  const rows = visibleRows();
  const names = el.namesRows.children;
  const values = el.valuesRows.children;
  for (let r = 0; r < rows.length && r < names.length; r++) {
    const on = state.selection.has(rows[r].trace.id);
    names[r].classList.toggle('selected', on);
    names[r].setAttribute('aria-selected', on ? 'true' : 'false');
    values[r].classList.toggle('selected', on);
  }
  updateToolbar();
  requestRender();
}

function updateVScroll() {
  const rows = visibleRows();
  const total = rows.length * ROW_H + ROW_H;
  el.vScrollInner.style.height = total + 'px';
  const maxScroll = Math.max(0, total - (waveHeight() - RULER_H));
  if (state.scrollY > maxScroll) setScrollY(maxScroll);
  el.vScroll.style.visibility = total > waveHeight() - RULER_H ? 'visible' : 'hidden';
}

function setScrollY(y) {
  const total = visibleRows().length * ROW_H + ROW_H;
  const maxScroll = Math.max(0, total - (waveHeight() - RULER_H));
  state.scrollY = Math.max(0, Math.min(maxScroll, y));
  el.namesRows.style.transform = `translateY(${-state.scrollY}px)`;
  el.valuesRows.style.transform = `translateY(${-state.scrollY}px)`;
  if (Math.abs(el.vScroll.scrollTop - state.scrollY) > 1) el.vScroll.scrollTop = state.scrollY;
  requestRender();
}

function rowFromClientY(clientY) {
  const rect = el.namesViewport.getBoundingClientRect();
  return Math.floor((clientY - rect.top + state.scrollY) / ROW_H);
}

// ---------------------------------------------------------------------------
// Selection and editing
// ---------------------------------------------------------------------------
function selectRow(r, e) {
  const rows = visibleRows();
  const row = rows[r];
  if (!row) return;
  const id = row.trace.id;
  if (e.shiftKey && state.selectionAnchor !== null) {
    const a = rows.findIndex((x) => x.trace.id === state.selectionAnchor);
    if (a >= 0) {
      if (!(e.ctrlKey || e.metaKey)) state.selection.clear();
      for (let k = Math.min(a, r); k <= Math.max(a, r); k++) state.selection.add(rows[k].trace.id);
      updateSelectionClasses();
      return;
    }
  }
  if (e.ctrlKey || e.metaKey) {
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
  } else {
    state.selection.clear();
    state.selection.add(id);
  }
  state.selectionAnchor = id;
  updateSelectionClasses();
}

/** Position after the last selected row (or the end) for inserts. */
function insertPosition() {
  const blocks = selectedBlocks();
  if (!blocks.length) return state.traces.length;
  let pos = blocks[blocks.length - 1] + 1;
  const t = state.traces[blocks[blocks.length - 1]];
  if (t.type === 'groupStart' && !t.collapsed) pos = groupEndIndex(blocks[blocks.length - 1]) + 1;
  return pos;
}

function insertTraces(newTraces, pos = insertPosition()) {
  state.traces.splice(pos, 0, ...newTraces);
  state.selection = new Set(newTraces.map((t) => t.id));
  state.selectionAnchor = newTraces.length ? newTraces[0].id : null;
  tracesChanged();
  scrollRowIntoView(newTraces[newTraces.length - 1]);
}

function scrollRowIntoView(trace) {
  if (!trace) return;
  const r = visibleRows().findIndex((x) => x.trace.id === trace.id);
  if (r < 0) return;
  const top = r * ROW_H;
  const viewH = waveHeight() - RULER_H;
  if (top < state.scrollY) setScrollY(top);
  else if (top + ROW_H > state.scrollY + viewH) setScrollY(top + ROW_H - viewH);
}

function insertBlank() {
  if (!state.wave) return;
  insertTraces([makeTrace({ type: 'blank' })]);
}

function insertLabel() {
  if (!state.wave) return;
  const pos = insertPosition();
  askText('New label', '', (text) => {
    insertTraces([makeTrace({ type: 'label', text })], pos);
  });
}

function groupSelection() {
  const blocks = selectedBlocks();
  if (!blocks.length) {
    showToast('Select the rows to group first.');
    return;
  }
  askText('Group name', 'Group', (name) => {
    const moving = blocks.map((i) => state.traces[i]);
    const pos = blocks[0];
    state.traces = state.traces.filter((_, i) => !blocks.includes(i));
    const start = makeTrace({ type: 'groupStart', name, collapsed: false });
    const end = makeTrace({ type: 'groupEnd', name });
    state.traces.splice(pos, 0, start, ...moving, end);
    state.selection = new Set([start.id]);
    state.selectionAnchor = start.id;
    tracesChanged();
  });
}

function removeSelection() {
  if (!state.selection.size) return;
  const remove = new Set();
  for (const i of selectedIndices()) {
    const t = state.traces[i];
    if (t.type === 'groupStart') {
      const end = groupEndIndex(i);
      if (t.collapsed) {
        for (let k = i; k <= end; k++) remove.add(k);
      } else {
        // Removing an open group just ungroups its rows.
        remove.add(i);
        remove.add(end);
      }
    } else {
      remove.add(i);
    }
  }
  state.traces = state.traces.filter((_, i) => !remove.has(i));
  state.selection.clear();
  tracesChanged();
}

function moveSelectionTo(targetIndex) {
  const blocks = selectedBlocks();
  if (!blocks.length) return;
  const targetTrace = state.traces[targetIndex];
  if (targetTrace && blocks.includes(targetIndex)) return;
  const moving = blocks.map((i) => state.traces[i]);
  state.traces = state.traces.filter((_, i) => !blocks.includes(i));
  let pos = targetTrace ? state.traces.indexOf(targetTrace) : state.traces.length;
  if (pos < 0) pos = state.traces.length;
  state.traces.splice(pos, 0, ...moving);
  tracesChanged();
}

function setRadix(radix) {
  let changed = false;
  for (const t of selectedSignalTraces()) {
    const sig = traceSignal(t);
    if (sig && (sig.kind === 'vector' || (sig.kind === 'bit' && sig.width > 1))) {
      t.radix = radix;
      changed = true;
    }
  }
  if (!changed) {
    showToast('Select one or more buses to change their radix.');
    return;
  }
  renderRows();
  updateToolbar();
  requestRender();
}

function toggleInvert() {
  for (const t of selectedSignalTraces()) t.invert = !t.invert;
  renderRows();
  requestRender();
}

function renameTrace(t) {
  if (!t) return;
  if (t.type === 'label') {
    askText('Edit label', t.text, (text) => {
      t.text = text;
      tracesChanged();
    });
  } else if (t.type === 'groupStart') {
    askText('Rename group', t.name, (name) => {
      const i = state.traces.indexOf(t);
      const end = state.traces[groupEndIndex(i)];
      t.name = name;
      if (end && end.type === 'groupEnd') end.name = name;
      tracesChanged();
    });
  } else if (t.type === 'signal') {
    const sig = traceSignal(t);
    askText('Display name (leave empty to use ' + (sig ? sig.name : t.name) + ')', t.alias || '', (text) => {
      t.alias = text || null;
      tracesChanged();
    }, true);
  }
}

function toggleGroup(t) {
  t.collapsed = !t.collapsed;
  if (t.collapsed) {
    // Hidden rows cannot stay selected.
    const i = state.traces.indexOf(t);
    const end = groupEndIndex(i);
    for (let k = i + 1; k <= end; k++) state.selection.delete(state.traces[k].id);
  }
  tracesChanged();
}

function jumpEdge(dir) {
  const t = selectedSignalTraces().find((x) => traceSignal(x));
  if (!t) {
    showToast('Select a signal to jump between its edges.');
    return;
  }
  const sig = traceSignal(t);
  const from = state.cursor !== null ? state.cursor : state.view.t0;
  const edge = dir > 0 ? WP.nextEdge(state.wave, sig, from) : WP.prevEdge(state.wave, sig, from);
  if (edge === null) {
    showToast(dir > 0 ? 'No later edge.' : 'No earlier edge.');
    return;
  }
  setCursor(edge);
  ensureVisible(edge);
}

function setCursor(t) {
  state.cursor = t;
  updateValues();
  renderStatus();
  requestRender();
}

function setMarker(t) {
  state.marker = t;
  renderStatus();
  requestRender();
}

function snapTime(t) {
  const w = state.wave;
  return Math.max(w.startTime, Math.min(w.endTime, Math.round(t)));
}

// ---------------------------------------------------------------------------
// Hierarchy tree
// ---------------------------------------------------------------------------
function kindTag(sig) {
  if (sig.kind === 'real') return 'real';
  if (sig.kind === 'string') return 'str';
  if (sig.width > 1) return sig.width + 'b';
  return sig.varType === 'reg' ? 'reg' : 'wire';
}

function renderTree() {
  const tree = el.hierTree;
  tree.textContent = '';
  if (!state.wave) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Open a waveform to browse its signals.';
    tree.appendChild(empty);
    return;
  }
  const filter = el.signalFilter.value.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  if (filter) {
    const matches = state.wave.signals.filter((s) => s.fullName.toLowerCase().includes(filter));
    for (const s of matches.slice(0, 2000)) frag.appendChild(signalItem(s, 0, true));
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No matching signals.';
      frag.appendChild(empty);
    }
  } else {
    const walk = (scope, depth) => {
      for (const idx of scope.signals) frag.appendChild(signalItem(state.wave.signals[idx], depth, false));
      for (const child of scope.children) {
        frag.appendChild(scopeItem(child, depth));
        if (state.treeExpanded.has(child.path)) walk(child, depth + 1);
      }
    };
    walk(state.wave.scope, 0);
  }
  tree.appendChild(frag);
  el.addSelectedBtn.disabled = state.treeSelection.size === 0;
}

function scopeItem(scope, depth) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.style.paddingLeft = (0.5 + depth * 0.9) + 'rem';
  item.dataset.scope = scope.path;
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-expanded', state.treeExpanded.has(scope.path) ? 'true' : 'false');
  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = state.treeExpanded.has(scope.path) ? '▾' : '▸';
  const name = document.createElement('span');
  name.className = 'tree-scope-name';
  name.textContent = scope.name;
  item.append(caret, name);
  if (scope.signals.length) {
    const add = document.createElement('button');
    add.className = 'tree-add';
    add.textContent = '+ all';
    add.title = `Add the ${scope.signals.length} signal(s) in ${scope.path}`;
    add.dataset.addScope = scope.path;
    item.appendChild(add);
  }
  return item;
}

function signalItem(sig, depth, showScope) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.style.paddingLeft = (0.5 + depth * 0.9 + 0.9) + 'rem';
  item.dataset.signal = sig.index;
  item.setAttribute('role', 'treeitem');
  if (state.treeSelection.has(sig.index)) item.classList.add('selected');
  const kind = document.createElement('span');
  kind.className = 'tree-kind';
  kind.textContent = kindTag(sig);
  const name = document.createElement('span');
  name.className = 'tree-signal-name';
  if (showScope && sig.scopePath) {
    const scope = document.createElement('span');
    scope.className = 'trace-scope';
    scope.textContent = sig.scopePath + '.';
    name.appendChild(scope);
  }
  name.appendChild(document.createTextNode(sig.name));
  const add = document.createElement('button');
  add.className = 'tree-add';
  add.textContent = '+';
  add.title = 'Add to the waveform';
  add.dataset.addSignal = sig.index;
  item.append(kind, name, add);
  item.title = sig.fullName;
  return item;
}

function findScope(path) {
  const walk = (scope) => {
    if (scope.path === path) return scope;
    for (const c of scope.children) {
      const f = walk(c);
      if (f) return f;
    }
    return null;
  };
  return walk(state.wave.scope);
}

function addSignals(indices) {
  if (!indices.length) return;
  insertTraces(indices.map((i) => signalTrace(i)));
}

function treeSignalOrder() {
  return [...el.hierTree.querySelectorAll('[data-signal]')].map((n) => Number(n.dataset.signal));
}

function onTreeClick(e) {
  const addSig = e.target.closest('[data-add-signal]');
  if (addSig) {
    addSignals([Number(addSig.dataset.addSignal)]);
    return;
  }
  const addScope = e.target.closest('[data-add-scope]');
  if (addScope) {
    addSignals(findScope(addScope.dataset.addScope).signals.slice());
    return;
  }
  const scopeEl = e.target.closest('[data-scope]');
  if (scopeEl) {
    const path = scopeEl.dataset.scope;
    if (state.treeExpanded.has(path)) state.treeExpanded.delete(path);
    else state.treeExpanded.add(path);
    renderTree();
    return;
  }
  const sigEl = e.target.closest('[data-signal]');
  if (!sigEl) return;
  const idx = Number(sigEl.dataset.signal);
  if (e.shiftKey && state.treeAnchor !== null) {
    const order = treeSignalOrder();
    const a = order.indexOf(state.treeAnchor);
    const b = order.indexOf(idx);
    if (a >= 0 && b >= 0) {
      if (!(e.ctrlKey || e.metaKey)) state.treeSelection.clear();
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) state.treeSelection.add(order[k]);
    }
  } else if (e.ctrlKey || e.metaKey) {
    if (state.treeSelection.has(idx)) state.treeSelection.delete(idx);
    else state.treeSelection.add(idx);
    state.treeAnchor = idx;
  } else {
    state.treeSelection = new Set([idx]);
    state.treeAnchor = idx;
  }
  renderTree();
}

function onTreeDblClick(e) {
  if (e.target.closest('.tree-add')) return;
  const sigEl = e.target.closest('[data-signal]');
  if (sigEl) addSignals([Number(sigEl.dataset.signal)]);
}

// ---------------------------------------------------------------------------
// Toolbar / status
// ---------------------------------------------------------------------------
function updateToolbar() {
  const loaded = !!state.wave;
  for (const id of ['exportBtn', 'zoomOutBtn', 'zoomInBtn', 'zoomFitBtn', 'zoomMarkersBtn',
    'insertBlankBtn', 'insertLabelBtn']) {
    el[id].disabled = !loaded;
  }
  el.hScroll.disabled = !loaded;
  const hasSel = state.selection.size > 0;
  el.groupBtn.disabled = !hasSel;
  el.removeBtn.disabled = !hasSel;
  const sigs = selectedSignalTraces().filter((t) => traceSignal(t));
  el.prevEdgeBtn.disabled = !sigs.length;
  el.nextEdgeBtn.disabled = !sigs.length;
  const buses = sigs.filter((t) => {
    const s = traceSignal(t);
    return s.kind === 'vector' || (s.kind === 'bit' && s.width > 1);
  });
  el.radixSelect.disabled = !buses.length;
  if (buses.length) el.radixSelect.value = buses[0].radix || 'hex';
}

function renderStatus() {
  const w = state.wave;
  if (!w) {
    el.statusFile.textContent = 'No file loaded';
    el.statusTimes.textContent = '';
    el.warningsBtn.classList.add('hidden');
    return;
  }
  el.statusFile.textContent = `${w.fileName} · ${w.formatLabel} · ${w.signals.length} signals · ` +
    `${fmtTime(w.startTime)} – ${fmtTime(w.endTime)} (timescale ${WP.unitFor(w.timescaleExp)})`;
  el.statusTimes.textContent = '';
  const add = (cls, text) => {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    el.statusTimes.appendChild(span);
  };
  if (state.cursor !== null) add('t-cursor', 'Cursor ' + fmtTime(state.cursor));
  if (state.marker !== null) {
    el.statusTimes.appendChild(document.createTextNode('   '));
    add('t-marker', 'Marker ' + fmtTime(state.marker));
  }
  if (state.cursor !== null && state.marker !== null) {
    el.statusTimes.appendChild(document.createTextNode('   Δ ' + fmtTime(Math.abs(state.cursor - state.marker))));
  }
  if (state.warnings.length) {
    el.warningsBtn.textContent = `⚠ ${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}`;
    el.warningsBtn.classList.remove('hidden');
  } else {
    el.warningsBtn.classList.add('hidden');
  }
}

let toastTimer = null;

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', isError);
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), isError ? 6000 : 3000);
}

// ---------------------------------------------------------------------------
// Dialogs and menus
// ---------------------------------------------------------------------------
let textDialogCallback = null;
let textDialogAllowEmpty = false;

function askText(title, initial, callback, allowEmpty = false) {
  el.labelDialogTitle.textContent = title;
  el.labelInput.value = initial;
  textDialogCallback = callback;
  textDialogAllowEmpty = allowEmpty;
  el.labelDialog.classList.remove('hidden');
  el.labelInput.focus();
  el.labelInput.select();
}

function closeTextDialog(ok) {
  el.labelDialog.classList.add('hidden');
  const cb = textDialogCallback;
  textDialogCallback = null;
  if (!ok || !cb) return;
  const text = el.labelInput.value.trim();
  if (!text && !textDialogAllowEmpty) return;
  cb(text);
}

function anyDialogOpen() {
  return [...document.querySelectorAll('.dialog-backdrop')].some((d) => !d.classList.contains('hidden'));
}

function closeMenus() {
  el.examplesMenu.classList.add('hidden');
  el.examplesBtn.setAttribute('aria-expanded', 'false');
  el.contextMenu.classList.add('hidden');
}

function buildExamplesMenu() {
  el.examplesMenu.textContent = '';
  for (const ex of EXAMPLES) {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'menuitem');
    btn.textContent = ex.title;
    const sub = document.createElement('span');
    sub.className = 'menu-sub';
    sub.textContent = ex.sub;
    btn.appendChild(sub);
    btn.addEventListener('click', () => {
      closeMenus();
      loadExample(ex);
    });
    el.examplesMenu.appendChild(btn);
  }
}

function toggleExamplesMenu() {
  const open = el.examplesMenu.classList.contains('hidden');
  closeMenus();
  if (open) {
    el.examplesMenu.classList.remove('hidden');
    el.examplesBtn.setAttribute('aria-expanded', 'true');
  }
}

function showContextMenu(x, y) {
  const menu = el.contextMenu;
  menu.textContent = '';
  const item = (label, action, disabled = false) => {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('click', () => {
      closeMenus();
      action();
    });
    menu.appendChild(btn);
  };
  const sep = () => menu.appendChild(document.createElement('hr'));
  const sigs = selectedSignalTraces().filter((t) => traceSignal(t));
  const hasBus = sigs.some((t) => {
    const s = traceSignal(t);
    return s.kind === 'vector' || (s.kind === 'bit' && s.width > 1);
  });
  const labels = { hex: 'Hexadecimal', dec: 'Decimal', signed: 'Signed decimal', bin: 'Binary',
    oct: 'Octal', ascii: 'ASCII' };
  for (const r of WP.RADIXES) item(labels[r], () => setRadix(r), !hasBus);
  item('Invert', toggleInvert, !sigs.length);
  sep();
  const single = state.selection.size === 1 ? state.traces.find((t) => state.selection.has(t.id)) : null;
  item('Rename…', () => renameTrace(single), !single || single.type === 'blank');
  item('Insert blank row', insertBlank);
  item('Insert label…', insertLabel);
  item('Group…', groupSelection, !state.selection.size);
  sep();
  item('Remove', removeSelection, !state.selection.size);
  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------
function setLoading(text, fraction) {
  if (text === null) {
    el.loadingOverlay.classList.add('hidden');
    return;
  }
  el.loadingOverlay.classList.remove('hidden');
  el.loadingText.textContent = text;
  el.progressBar.style.width = Math.round((fraction || 0) * 100) + '%';
}

function baseName(path) {
  return (path || '').split(/[\\/]/).pop();
}

async function openFiles(files) {
  const list = [...files];
  if (!list.length) return;
  const saveFile = list.find((f) => WP.isSaveFile(f.name));
  const waveFile = list.find((f) => !WP.isSaveFile(f.name));
  let gtkw = null;
  if (saveFile) {
    gtkw = { name: saveFile.name, parsed: WP.parseGtkw(await saveFile.text()) };
  }
  if (waveFile) {
    const bytes = new Uint8Array(await waveFile.arrayBuffer());
    await loadWaveBytes(bytes, waveFile.name, gtkw || state.pendingGtkw);
    state.pendingGtkw = null;
    return;
  }
  if (!gtkw) return;
  if (state.wave) {
    applySaveFile(gtkw.parsed);
    showToast(`Applied ${gtkw.name} to ${state.wave.fileName}.`);
    return;
  }
  state.pendingGtkw = gtkw;
  const dump = baseName(gtkw.parsed.dumpfile);
  el.pairText.textContent = dump ?
    `${gtkw.name} was saved for "${dump}". Browsers cannot open that path directly, so choose the ` +
    'waveform file and its signals, labels and groups will be restored.' :
    `${gtkw.name} does not name its waveform. Choose the waveform file to apply it to.`;
  el.pairDialog.classList.remove('hidden');
}

async function loadWaveBytes(bytes, fileName, gtkw) {
  setLoading(`Reading ${fileName}…`, 0);
  try {
    const wave = await WP.loadWaveform(bytes, fileName, {
      onProgress: (f) => setLoading(`Reading ${fileName}…`, f),
    });
    installWave(wave);
    if (gtkw) applySaveFile(gtkw.parsed);
    else applyDefaultTraces();
  } catch (err) {
    console.error(err);
    const msg = err && (err.name === 'UnsupportedFormatError' || err.name === 'WaveParseError') ?
      err.message : `Could not read ${fileName}: ${err && err.message ? err.message : err}`;
    showToast(msg, true);
  } finally {
    setLoading(null);
  }
}

function installWave(wave) {
  state.wave = wave;
  state.traces = [];
  state.selection.clear();
  state.selectionAnchor = null;
  state.cursor = null;
  state.marker = null;
  state.scrollY = 0;
  state.warnings = wave.warnings.slice();
  state.treeSelection.clear();
  state.treeAnchor = null;
  state.treeExpanded = new Set();
  for (const c of wave.scope.children) state.treeExpanded.add(c.path);
  el.signalFilter.value = '';
  el.dropZone.classList.add('hidden');
  renderTree();
}

function applyDefaultTraces() {
  const w = state.wave;
  let picks = w.scope.signals.slice();
  for (const top of w.scope.children) picks.push(...top.signals);
  if (!picks.length) {
    // No signals at the top: take the first scope (breadth-first) that has some.
    const queue = [...w.scope.children];
    while (queue.length) {
      const s = queue.shift();
      if (s.signals.length) {
        picks = s.signals.slice();
        break;
      }
      queue.push(...s.children);
    }
  }
  if (picks.length > MAX_DEFAULT_TRACES) {
    state.warnings.push(`Only the first ${MAX_DEFAULT_TRACES} top-level signals were added; ` +
      'use the hierarchy panel to add others.');
    picks = picks.slice(0, MAX_DEFAULT_TRACES);
  }
  state.traces = picks.map((i) => signalTrace(i));
  tracesChanged();
  zoomFit();
  setCursor(null);
  renderStatus();
}

function applySaveFile(parsed) {
  const w = state.wave;
  const { traces, warnings } = WP.resolveGtkw(parsed, w);
  state.traces = traces.map((t) => makeTrace(t));
  state.selection.clear();
  state.warnings = w.warnings.concat(warnings);
  setScrollY(0);
  tracesChanged();
  if (parsed.zoom !== null) {
    setView(parsed.timestart !== null ? parsed.timestart : w.startTime, WP.zoomToTimePerPx(parsed.zoom));
  } else {
    zoomFit();
  }
  state.cursor = parsed.marker;
  state.marker = parsed.namedMarkers.length && parsed.namedMarkers[0] !== null ? parsed.namedMarkers[0] : null;
  updateValues();
  renderStatus();
  requestRender();
}

async function loadExample(ex) {
  if (location.protocol === 'file:') {
    showToast('Examples need the page to be served over http (e.g. "npx serve .") — ' +
      'browsers block loading files from file:// pages.', true);
    return;
  }
  setLoading(`Fetching ${ex.title}…`, 0);
  try {
    const files = await Promise.all(ex.files.map(async (name) => {
      const res = await fetch('examples/' + name);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      return new File([await res.blob()], name);
    }));
    setLoading(null);
    await openFiles(files);
  } catch (err) {
    setLoading(null);
    showToast('Could not load the example: ' + err.message, true);
  }
}

function exportGtkw() {
  if (!state.wave) return;
  const text = WP.serializeGtkw({
    wave: state.wave,
    traces: state.traces,
    view: state.view,
    cursor: state.cursor,
    marker: state.marker,
  });
  const name = state.wave.fileName.replace(/(\.gz)?$/i, '').replace(/\.[^.]*$/, '') + '.gtkw';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Canvas interaction
// ---------------------------------------------------------------------------
let canvasDrag = null;

function canvasPoint(e) {
  const rect = el.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onCanvasMouseDown(e) {
  if (!state.wave) return;
  el.canvas.focus();
  const p = canvasPoint(e);
  if (p.x > waveWidth()) return;
  if (e.button === 1) {
    e.preventDefault();
    canvasDrag = { mode: 'pan', lastX: p.x };
    return;
  }
  if (e.button === 2 || (e.button === 0 && e.altKey)) {
    setMarker(snapTime(timeAtX(p.x)));
    return;
  }
  if (e.button !== 0) return;
  if (p.y < RULER_H) {
    rulerDrag = { x0: p.x, x1: p.x };
    canvasDrag = { mode: 'ruler' };
    requestRender();
    return;
  }
  canvasDrag = { mode: 'cursor' };
  setCursor(snapTime(timeAtX(p.x)));
  const r = Math.floor((p.y - RULER_H + state.scrollY) / ROW_H);
  if (visibleRows()[r]) selectRow(r, e);
}

function onWindowMouseMove(e) {
  if (canvasDrag) {
    const p = canvasPoint(e);
    if (canvasDrag.mode === 'pan') {
      panBy(canvasDrag.lastX - p.x);
      canvasDrag.lastX = p.x;
    } else if (canvasDrag.mode === 'ruler') {
      rulerDrag.x1 = Math.max(0, Math.min(waveWidth(), p.x));
      requestRender();
    } else if (canvasDrag.mode === 'cursor') {
      setCursor(snapTime(timeAtX(Math.max(0, Math.min(waveWidth(), p.x)))));
    }
  }
  if (nameDrag) onNameDragMove(e);
  if (resizeDrag) {
    const w = Math.max(100, Math.min(600, resizeDrag.w + e.clientX - resizeDrag.x));
    el.namesCol.style.width = w + 'px';
  }
}

function onWindowMouseUp(e) {
  if (canvasDrag && canvasDrag.mode === 'ruler') {
    const { x0, x1 } = rulerDrag;
    rulerDrag = null;
    if (Math.abs(x1 - x0) > 4) zoomToRange(timeAtX(x0), timeAtX(x1));
    else setCursor(snapTime(timeAtX(x0)));
    requestRender();
  }
  canvasDrag = null;
  if (nameDrag) onNameDragEnd(e);
  if (resizeDrag) {
    resizeDrag = null;
    resizeCanvas();
  }
}

function onCanvasWheel(e) {
  if (!state.wave) return;
  e.preventDefault();
  const p = canvasPoint(e);
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  if (e.ctrlKey || e.metaKey) {
    zoomAt(Math.pow(1.0015, delta), Math.min(p.x, waveWidth()));
  } else if (e.shiftKey) {
    panBy(delta);
  } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    panBy(e.deltaX);
  } else {
    setScrollY(state.scrollY + delta);
  }
}

// ---------------------------------------------------------------------------
// Names column interaction (select, drag to reorder, collapse, rename)
// ---------------------------------------------------------------------------
let nameDrag = null;
let resizeDrag = null;

function onNamesMouseDown(e) {
  if (e.button !== 0) return;
  const rowEl = e.target.closest('.trace-row');
  if (!rowEl) {
    state.selection.clear();
    updateSelectionClasses();
    return;
  }
  const r = Number(rowEl.dataset.row);
  const row = visibleRows()[r];
  if (e.target.dataset.toggle) {
    toggleGroup(row.trace);
    return;
  }
  if (!state.selection.has(row.trace.id) || e.ctrlKey || e.metaKey || e.shiftKey) selectRow(r, e);
  nameDrag = { startY: e.clientY, active: false, row: r, target: null };
}

function clearDropMarks() {
  for (const n of el.namesRows.querySelectorAll('.drop-before, .drop-after')) {
    n.classList.remove('drop-before', 'drop-after');
  }
}

function onNameDragMove(e) {
  if (!nameDrag.active && Math.abs(e.clientY - nameDrag.startY) < 5) return;
  nameDrag.active = true;
  const rows = visibleRows();
  let r = Math.max(0, Math.min(rows.length, Math.round(rowFromClientY(e.clientY + ROW_H / 2))));
  clearDropMarks();
  const children = el.namesRows.children;
  if (r < rows.length) children[r].classList.add('drop-before');
  else if (rows.length) children[rows.length - 1].classList.add('drop-after');
  nameDrag.target = r;
}

function onNameDragEnd(e) {
  const drag = nameDrag;
  nameDrag = null;
  clearDropMarks();
  if (!drag.active) {
    // A plain click on an already-selected row selects just that row.
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) selectRow(drag.row, e);
    return;
  }
  const rows = visibleRows();
  const target = drag.target < rows.length ? rows[drag.target].index : state.traces.length;
  moveSelectionTo(target);
}

function onNamesDblClick(e) {
  const rowEl = e.target.closest('.trace-row');
  if (!rowEl || e.target.dataset.toggle) return;
  const row = visibleRows()[Number(rowEl.dataset.row)];
  if (row) renameTrace(row.trace);
}

function onNamesContextMenu(e) {
  e.preventDefault();
  if (!state.wave) return;
  const rowEl = e.target.closest('.trace-row');
  if (rowEl) {
    const r = Number(rowEl.dataset.row);
    const row = visibleRows()[r];
    if (row && !state.selection.has(row.trace.id)) selectRow(r, { shiftKey: false, ctrlKey: false });
  }
  showContextMenu(e.clientX, e.clientY);
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------
function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (!el.labelDialog.classList.contains('hidden')) closeTextDialog(false);
    for (const d of document.querySelectorAll('.dialog-backdrop')) d.classList.add('hidden');
    closeMenus();
    return;
  }
  if (anyDialogOpen()) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
  if (!state.wave) return;

  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    if (ctrl) jumpEdge(dir);
    else panBy(dir * waveWidth() * 0.1);
    e.preventDefault();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeSelection();
    e.preventDefault();
    return;
  }
  if (ctrl || e.altKey) return;
  const actions = {
    '+': () => zoomCentered(0.5),
    '=': () => zoomCentered(0.5),
    '-': () => zoomCentered(2),
    '_': () => zoomCentered(2),
    f: zoomFit,
    m: zoomToMarkers,
    h: () => setRadix('hex'),
    d: () => setRadix('dec'),
    s: () => setRadix('signed'),
    n: () => setRadix('bin'),
    o: () => setRadix('oct'),
    b: insertBlank,
    l: insertLabel,
    g: groupSelection,
  };
  const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (action) {
    action();
    e.preventDefault();
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function cacheElements() {
  for (const id of ['openBtn', 'examplesBtn', 'examplesMenu', 'exportBtn', 'fileInput', 'zoomOutBtn',
    'zoomInBtn', 'zoomFitBtn', 'zoomMarkersBtn', 'prevEdgeBtn', 'nextEdgeBtn', 'radixSelect',
    'insertBlankBtn', 'insertLabelBtn', 'groupBtn', 'removeBtn', 'workspace', 'signalFilter', 'hierTree',
    'addSelectedBtn', 'namesCol', 'namesViewport', 'namesRows', 'namesResizer', 'valuesViewport',
    'valuesRows', 'waveCol', 'vScroll', 'vScrollInner', 'hScroll', 'dropZone', 'dropOpenBtn',
    'dropExampleBtn', 'loadingOverlay', 'loadingText', 'progressBar', 'statusFile', 'statusTimes',
    'warningsBtn', 'contextMenu', 'toast', 'pairDialog', 'pairText', 'pairCancel', 'pairOpen',
    'labelDialog', 'labelDialogTitle', 'labelInput', 'labelCancel', 'labelOk', 'warningsDialog',
    'warningsList', 'warningsClose', 'helpDialog', 'helpClose']) {
    el[id] = $(id);
  }
  el.canvas = $('waveCanvas');
}

function wireDialogs() {
  const settingsDialog = $('settingsDialog');
  $('settingsBtn').addEventListener('click', () => settingsDialog.classList.remove('hidden'));
  $('closeSettings').addEventListener('click', () => settingsDialog.classList.add('hidden'));
  $('darkModeToggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    applyTheme(theme);
    setCookie(THEME_COOKIE, theme, 365);
    readColors();
    requestRender();
  });
  $('helpBtn').addEventListener('click', () => el.helpDialog.classList.remove('hidden'));
  el.helpClose.addEventListener('click', () => el.helpDialog.classList.add('hidden'));
  el.warningsClose.addEventListener('click', () => el.warningsDialog.classList.add('hidden'));
  el.warningsBtn.addEventListener('click', () => {
    el.warningsList.textContent = '';
    for (const w of state.warnings) {
      const li = document.createElement('li');
      li.textContent = w;
      el.warningsList.appendChild(li);
    }
    el.warningsDialog.classList.remove('hidden');
  });
  el.labelOk.addEventListener('click', () => closeTextDialog(true));
  el.labelCancel.addEventListener('click', () => closeTextDialog(false));
  el.labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeTextDialog(true);
  });
  el.pairCancel.addEventListener('click', () => {
    state.pendingGtkw = null;
    el.pairDialog.classList.add('hidden');
  });
  el.pairOpen.addEventListener('click', () => {
    el.pairDialog.classList.add('hidden');
    el.fileInput.click();
  });
  // Click outside a dialog closes it.
  for (const backdrop of document.querySelectorAll('.dialog-backdrop')) {
    backdrop.addEventListener('click', (e) => {
      if (e.target !== backdrop) return;
      if (backdrop === el.labelDialog) closeTextDialog(false);
      if (backdrop === el.pairDialog) state.pendingGtkw = null;
      backdrop.classList.add('hidden');
    });
  }
}

function wireToolbar() {
  el.openBtn.addEventListener('click', () => el.fileInput.click());
  el.dropOpenBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    const files = el.fileInput.files;
    openFiles(files).finally(() => {
      el.fileInput.value = '';
    });
  });
  el.examplesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExamplesMenu();
  });
  el.dropExampleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExamplesMenu();
  });
  el.exportBtn.addEventListener('click', exportGtkw);
  el.zoomInBtn.addEventListener('click', () => zoomCentered(0.5));
  el.zoomOutBtn.addEventListener('click', () => zoomCentered(2));
  el.zoomFitBtn.addEventListener('click', zoomFit);
  el.zoomMarkersBtn.addEventListener('click', zoomToMarkers);
  el.prevEdgeBtn.addEventListener('click', () => jumpEdge(-1));
  el.nextEdgeBtn.addEventListener('click', () => jumpEdge(1));
  el.radixSelect.addEventListener('change', () => setRadix(el.radixSelect.value));
  el.insertBlankBtn.addEventListener('click', insertBlank);
  el.insertLabelBtn.addEventListener('click', insertLabel);
  el.groupBtn.addEventListener('click', groupSelection);
  el.removeBtn.addEventListener('click', removeSelection);
  el.hScroll.addEventListener('input', () => {
    if (!state.wave) return;
    const visible = state.view.timePerPx * waveWidth();
    const start = state.wave.startTime;
    const maxT0 = Math.max(start, state.wave.endTime - visible * 0.5);
    state.view.t0 = start + (Number(el.hScroll.value) / 1000) * (maxT0 - start);
    requestRender();
  });
}

function wireWorkspace() {
  el.canvas.addEventListener('mousedown', onCanvasMouseDown);
  el.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  el.canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);

  el.namesRows.parentElement.addEventListener('mousedown', onNamesMouseDown);
  el.namesViewport.addEventListener('dblclick', onNamesDblClick);
  el.namesViewport.addEventListener('contextmenu', onNamesContextMenu);
  for (const vp of [el.namesViewport, el.valuesViewport]) {
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      setScrollY(state.scrollY + (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
    }, { passive: false });
  }
  el.vScroll.addEventListener('scroll', () => {
    if (Math.abs(el.vScroll.scrollTop - state.scrollY) > 1) setScrollY(el.vScroll.scrollTop);
  });
  el.namesResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizeDrag = { x: e.clientX, w: el.namesCol.offsetWidth };
  });

  el.hierTree.addEventListener('click', onTreeClick);
  el.hierTree.addEventListener('dblclick', onTreeDblClick);
  el.signalFilter.addEventListener('input', renderTree);
  el.addSelectedBtn.addEventListener('click', () => {
    const order = state.wave.signals.map((s) => s.index).filter((i) => state.treeSelection.has(i));
    addSignals(order);
  });

  // Drag and drop files anywhere on the page.
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    dragDepth++;
    el.workspace.classList.add('drag-over');
    el.dropZone.classList.add('drag-over');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      el.workspace.classList.remove('drag-over');
      el.dropZone.classList.remove('drag-over');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.workspace.classList.remove('drag-over');
    el.dropZone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.popup-menu') && !e.target.closest('#examplesBtn') &&
      !e.target.closest('#dropExampleBtn')) {
      closeMenus();
    }
  });
  document.addEventListener('keydown', onKeyDown);
  new ResizeObserver(resizeCanvas).observe(el.waveCol);
  window.addEventListener('resize', resizeCanvas);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  cacheElements();
  readColors();
  buildExamplesMenu();
  wireDialogs();
  wireToolbar();
  wireWorkspace();
  renderTree();
  renderStatus();
  updateToolbar();
  resizeCanvas();
});
