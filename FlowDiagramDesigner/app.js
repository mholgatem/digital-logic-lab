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
const FD = window.FlowDiagram;
const G = FD.geom;
const R = FD.routing;
const S = FD.shapes;
const IO = FD.io;

const AUTOSAVE_KEY = 'fdd_autosave';
const UI_KEY = 'fdd_ui';
const MAX_UNDO = 200;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const MIN_SIZE = 8;
const STUB = 20;
const ROTATE_SNAP = 15;
const DRAG_THRESHOLD = 3;

const STROKE_TOKENS = ['ink', 'muted', 'vw-orange', 'vw-yellow', 'vw-fuchsia', 'vw-blue', 'vw-purple', 'vw-green', 'vw-red'];
const FILL_TOKENS = ['paper', 'ink', 'tint-orange', 'tint-yellow', 'tint-fuchsia', 'tint-blue', 'tint-purple', 'tint-green', 'tint-red'];
const TOKEN_NAMES = {
  'ink': 'Ink (follows theme)', 'muted': 'Grey', 'paper': 'Paper (follows theme)',
  'vw-orange': 'Orange', 'vw-yellow': 'Yellow', 'vw-fuchsia': 'Fuchsia', 'vw-blue': 'Blue',
  'vw-purple': 'Purple', 'vw-green': 'Green', 'vw-red': 'Red',
  'tint-orange': 'Orange tint', 'tint-yellow': 'Yellow tint', 'tint-fuchsia': 'Fuchsia tint',
  'tint-blue': 'Blue tint', 'tint-purple': 'Purple tint', 'tint-green': 'Green tint', 'tint-red': 'Red tint',
};
const DASHES = { solid: '', dashed: '8 5', dotted: '1 4', long: '16 6' };
const ARROWS = [['none', 'None'], ['arrow', 'Arrow'], ['open', 'Open arrow'], ['dot', 'Dot'], ['bar', 'Bar']];
const NODE_LABEL_POS = [['center', 'Centre'], ['top', 'Inside top'], ['bottom', 'Inside bottom'],
  ['left', 'Inside left'], ['right', 'Inside right'], ['above', 'Above'], ['below', 'Below'],
  ['before', 'Left (outside)'], ['after', 'Right (outside)']];
const GROUP_LABEL_POS = [['top-left', 'Top left (on border)'], ['top', 'Top (on border)'],
  ['top-right', 'Top right (on border)'], ['inside-top', 'Inside top'], ['center', 'Centre'],
  ['inside-bottom', 'Inside bottom'], ['bottom-left', 'Bottom left (on border)'], ['bottom', 'Bottom (on border)'],
  ['bottom-right', 'Bottom right (on border)'], ['left', 'Left (on border)'], ['right', 'Right (on border)']];
const EXAMPLES = [
  { file: 'simple-cpu-datapath.json', name: 'Simple CPU datapath', sub: 'Instruction memory, register file, ALU and W register' },
  { file: 'logic-gates.json', name: 'Logic gate circuit', sub: 'Half adder with labelled inputs and outputs' },
];

function blankDoc() {
  return {
    name: 'Untitled diagram', nodes: [], edges: [], groups: [], nextId: 1,
    grid: { size: 10, snap: true, show: true },
  };
}

let doc = blankDoc();
const view = { x: 0, y: 0, zoom: 1 };
let selection = new Set();
let history = [];
let historyIndex = -1;
let lastCommit = { label: '', time: 0, index: -1 };
let drag = null;
let hoverNode = null;
let clipboard = null;
let pasteCount = 0;
let editing = null;
let renderQueued = false;
let autosaveTimer = null;
let toastTimer = null;
let newEdgeStyle = 'ortho';
let uiPrefs = { collapsed: {}, history: false, edgeStyle: 'ortho' };
const routeCache = new Map();
const el = {};

function $(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const r2 = (v) => Math.round(v * 100) / 100;
const esc = S.esc;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normAngle = (a) => r2(((a % 360) + 360) % 360);
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

function newId(prefix) {
  return prefix + (doc.nextId++);
}

function isToken(c) {
  return c === 'ink' || c === 'muted' || c === 'paper' || /^(vw|tint)-/.test(c);
}

function colorCss(c) {
  if (!c || c === 'none' || c === 'transparent') return 'none';
  if (isToken(c)) return 'var(--fd-' + c + ')';
  return c;
}

function dashCss(dash, sw) {
  const pattern = DASHES[dash] || '';
  if (!pattern) return '';
  const k = Math.max(1, sw / 2);
  return pattern.split(' ').map((v) => r2(Number(v) * k)).join(' ');
}

function snapOn() {
  return !!doc.grid.snap;
}

function snapV(v) {
  return snapOn() ? G.snap(v, doc.grid.size) : v;
}

function findNode(id) {
  return doc.nodes.find((n) => n.id === id);
}

function findEdge(id) {
  return doc.edges.find((e) => e.id === id);
}

function findGroup(id) {
  return doc.groups.find((g) => g.id === id);
}

function parentOf(id) {
  return doc.groups.find((g) => g.members.includes(id)) || null;
}

/** Group ids enclosing an item, outermost first. */
function ancestors(id) {
  const out = [];
  let p = parentOf(id);
  let guard = 0;
  while (p && guard++ < 50) {
    out.unshift(p.id);
    p = parentOf(p.id);
  }
  return out;
}

function groupNodesDeep(gid, out = new Set(), guard = 0) {
  const g = findGroup(gid);
  if (!g || guard > 50) return out;
  for (const m of g.members) {
    if (findGroup(m)) groupNodesDeep(m, out, guard + 1);
    else out.add(m);
  }
  return out;
}

function groupGroupsDeep(gid, out = new Set(), guard = 0) {
  const g = findGroup(gid);
  if (!g || guard > 50) return out;
  out.add(gid);
  for (const m of g.members) if (findGroup(m)) groupGroupsDeep(m, out, guard + 1);
  return out;
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileBase() {
  return (doc.name || 'diagram').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'diagram';
}

// ---------------------------------------------------------------------------
// Model factories
// ---------------------------------------------------------------------------
function makeNode(type, cx, cy) {
  const def = S.get(type);
  const n = {
    id: newId('n'),
    type: def.id,
    x: snapV(cx - def.w / 2),
    y: snapV(cy - def.h / 2),
    w: def.w,
    h: def.h,
    rotation: 0,
    fill: def.fill || 'paper',
    stroke: def.stroke || 'ink',
    strokeWidth: 2,
    dash: 'solid',
    label: {
      text: def.label || '',
      pos: def.labelPos || 'center',
      dx: def.labelOffset ? def.labelOffset.x : 0,
      dy: def.labelOffset ? def.labelOffset.y : 0,
      rotation: def.labelRotation || 0,
      size: def.labelSize || 14,
      color: def.labelColor || 'ink',
      bold: !!def.labelBold,
    },
    props: deepCopy(def.props || {}),
  };
  return n;
}

function makeEdge(from, to, extra = {}) {
  return Object.assign({
    id: newId('e'),
    from,
    to,
    style: newEdgeStyle,
    waypoints: [],
    manual: false,
    curve: { u: 0, v: 0 },
    stroke: 'ink',
    strokeWidth: 2,
    dash: 'solid',
    arrowStart: 'none',
    arrowEnd: 'arrow',
    busWidth: '',
    busPos: 0.5,
    labels: [],
  }, extra);
}

function makeGroup(members) {
  return {
    id: newId('g'),
    members,
    outline: 'rect',
    padding: 14,
    radius: 8,
    stroke: 'vw-orange',
    strokeWidth: 2,
    dash: 'dashed',
    fill: 'none',
    label: { text: '', pos: 'top-left', dx: 0, dy: 0, rotation: 0, size: 18, color: 'vw-orange', bold: true, bg: true },
  };
}

function makeLabel(text, t) {
  return { text, t, dx: 0, dy: 0, rotation: 0, size: 13, color: 'ink', bold: false, bg: true };
}

// ---------------------------------------------------------------------------
// Ports, endpoints and edge geometry
// ---------------------------------------------------------------------------
function nodePortsLocal(n) {
  try {
    return S.get(n.type).ports(n) || [];
  } catch (err) {
    return [];
  }
}

function portWorld(n, port) {
  return { pt: G.localToWorld(n, port), dir: G.axisDir(G.rotateVec(port.dir, n.rotation || 0)) };
}

/** Projects a normalised local position onto the shape's outline. */
function boundaryLocal(n, nx, ny) {
  const def = S.get(n.type);
  const w = n.w;
  const h = n.h;
  const cx = w / 2;
  const cy = h / 2;
  let x = nx * w;
  let y = ny * h;
  if (def.boundary === 'ellipse' || def.boundary === 'diamond') {
    let dx = (x - cx) / (w / 2 || 1);
    let dy = (y - cy) / (h / 2 || 1);
    if (!dx && !dy) dx = 1;
    let k;
    if (def.boundary === 'ellipse') k = 1 / Math.hypot(dx, dy);
    else k = 1 / (Math.abs(dx) + Math.abs(dy));
    dx *= k;
    dy *= k;
    x = cx + dx * w / 2;
    y = cy + dy * h / 2;
    return { x, y, dir: G.axisDir({ x: dx, y: dy }) };
  }
  const dl = x;
  const dr = w - x;
  const dt = y;
  const db = h - y;
  const m = Math.min(dl, dr, dt, db);
  x = clamp(x, 0, w);
  y = clamp(y, 0, h);
  if (m === dl) return { x: 0, y, dir: { x: -1, y: 0 } };
  if (m === dr) return { x: w, y, dir: { x: 1, y: 0 } };
  if (m === dt) return { x, y: 0, dir: { x: 0, y: -1 } };
  return { x, y: h, dir: { x: 0, y: 1 } };
}

function resolveEnd(end) {
  if (end && end.node) {
    const n = findNode(end.node);
    if (n) {
      if (end.port) {
        const lp = nodePortsLocal(n).find((p) => p.id === end.port);
        if (lp) return Object.assign(portWorld(n, lp), { node: n, stub: STUB });
      }
      const b = boundaryLocal(n, end.nx !== undefined ? end.nx : 0.5, end.ny !== undefined ? end.ny : 1);
      return { pt: G.localToWorld(n, b), dir: G.axisDir(G.rotateVec(b.dir, n.rotation || 0)), node: n, stub: STUB };
    }
  }
  return { pt: { x: (end && end.x) || 0, y: (end && end.y) || 0 }, dir: null, node: null, stub: 0 };
}

function routeObstacles(s, t) {
  const region = G.inflate(G.bboxOf([s.pt, t.pt]), 160);
  const out = [];
  for (const n of doc.nodes) {
    if (n.type === 'junction' || n.type === 'busslash') continue;
    const b = G.nodeBBox(n);
    if (G.boxesIntersect(b, region)) out.push(b);
  }
  return out;
}

function autoRouteCached(e, s, t) {
  const obs = routeObstacles(s, t);
  const key = JSON.stringify([s.pt, s.dir, s.stub, t.pt, t.dir, t.stub, obs]);
  const hit = routeCache.get(e.id);
  if (hit && hit.key === key) return hit.pts;
  const pts = R.autoRoute(s, t, obs);
  routeCache.set(e.id, { key, pts });
  return pts;
}

/** Resolved drawing geometry for an edge. `pts` is a polyline in all cases. */
function edgeGeom(e) {
  const s = resolveEnd(e.from);
  const t = resolveEnd(e.to);
  if (e.style === 'curve') {
    const a = s.pt;
    const b = t.pt;
    const len = G.dist(a, b) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const mid = G.lerp(a, b, 0.5);
    const cu = (e.curve && e.curve.u) || 0;
    const cv = (e.curve && e.curve.v) || 0;
    const c = { x: mid.x + ux * cu - uy * cv, y: mid.y + uy * cu + ux * cv };
    return { kind: 'curve', s, t, a, b, c, pts: G.quadSamples(a, c, b, 32) };
  }
  if (e.style === 'ortho') {
    const pts = (e.manual && e.waypoints.length) ? R.manualRoute(s, t, e.waypoints) : autoRouteCached(e, s, t);
    return { kind: 'ortho', s, t, pts };
  }
  return { kind: 'straight', s, t, pts: [s.pt, t.pt] };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
function labelBox(lab) {
  const lines = String(lab.text || '').split('\n');
  const size = lab.size || 14;
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return { w: maxLen * size * 0.6 + 8, h: lines.length * size * 1.25 + 2, lines, size };
}

function labelMarkup(lab, x, y, rot, attrs, opts = {}) {
  const box = labelBox(lab);
  let s = '<g ' + (attrs || '') + ' transform="translate(' + r2(x) + ' ' + r2(y) + ')' +
    (rot ? ' rotate(' + r2(rot) + ')' : '') + '">';
  if (lab.bg && opts.bgOk !== false) {
    s += '<rect x="' + r2(-box.w / 2) + '" y="' + r2(-box.h / 2) + '" width="' + r2(box.w) + '" height="' +
      r2(box.h) + '" rx="3" style="fill:var(--fd-paper);stroke:none"/>';
  } else if (!opts.forExport) {
    s += '<rect class="fd-hit-body" x="' + r2(-box.w / 2) + '" y="' + r2(-box.h / 2) + '" width="' + r2(box.w) +
      '" height="' + r2(box.h) + '"/>';
  }
  s += '<text text-anchor="middle" dominant-baseline="central" style="fill:' + colorCss(lab.color || 'ink') +
    ';stroke:none;font-size:' + box.size + 'px' + (lab.bold ? ';font-weight:700' : '') + '">';
  const lh = box.size * 1.25;
  box.lines.forEach((ln, i) => {
    s += '<tspan x="0" y="' + r2((i - (box.lines.length - 1) / 2) * lh) + '">' + (esc(ln) || '&#160;') + '</tspan>';
  });
  return s + '</text></g>';
}

/** Label centre in the node's local frame. */
function nodeLabelAnchor(n) {
  const lab = n.label;
  const box = labelBox(lab);
  const { w, h } = n;
  let p;
  switch (lab.pos) {
    case 'top': p = { x: w / 2, y: box.h / 2 + 4 }; break;
    case 'bottom': p = { x: w / 2, y: h - box.h / 2 - 4 }; break;
    case 'left': p = { x: box.w / 2 + 4, y: h / 2 }; break;
    case 'right': p = { x: w - box.w / 2 - 4, y: h / 2 }; break;
    case 'above': p = { x: w / 2, y: -box.h / 2 - 4 }; break;
    case 'below': p = { x: w / 2, y: h + box.h / 2 + 4 }; break;
    case 'before': p = { x: -box.w / 2 - 6, y: h / 2 }; break;
    case 'after': p = { x: w + box.w / 2 + 4, y: h / 2 }; break;
    default: p = { x: w / 2, y: h / 2 };
  }
  return { x: p.x + (lab.dx || 0), y: p.y + (lab.dy || 0) };
}

function groupLabelAnchor(g, geom) {
  const lab = g.label;
  const box = labelBox(lab);
  const b = geom.bbox;
  const inset = 18 + box.w / 2;
  let p;
  switch (lab.pos) {
    case 'top': p = { x: b.x + b.w / 2, y: b.y }; break;
    case 'top-right': p = { x: b.x + b.w - inset, y: b.y }; break;
    case 'inside-top': p = { x: b.x + b.w / 2, y: b.y + box.h / 2 + 6 }; break;
    case 'center': p = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; break;
    case 'inside-bottom': p = { x: b.x + b.w / 2, y: b.y + b.h - box.h / 2 - 6 }; break;
    case 'bottom-left': p = { x: b.x + inset, y: b.y + b.h }; break;
    case 'bottom': p = { x: b.x + b.w / 2, y: b.y + b.h }; break;
    case 'bottom-right': p = { x: b.x + b.w - inset, y: b.y + b.h }; break;
    case 'left': p = { x: b.x, y: b.y + b.h / 2 }; break;
    case 'right': p = { x: b.x + b.w, y: b.y + b.h / 2 }; break;
    default: p = { x: b.x + inset, y: b.y };
  }
  return { x: p.x + (lab.dx || 0), y: p.y + (lab.dy || 0) };
}

function edgeLabelPoint(geom, lab) {
  const p = G.pointAlong(geom.pts, lab.t !== undefined ? lab.t : 0.5);
  return { x: p.x + (lab.dx || 0), y: p.y + (lab.dy || 0) };
}

// ---------------------------------------------------------------------------
// Group outlines
// ---------------------------------------------------------------------------
function computeGroupGeoms() {
  const memo = new Map();
  const visit = (g, depth) => {
    if (memo.has(g.id)) return memo.get(g.id);
    if (depth > 40) return null;
    const points = [];
    const boxes = [];
    for (const m of g.members) {
      const n = findNode(m);
      if (n) {
        const c = G.corners(n);
        points.push(...c);
        boxes.push(G.bboxOf(c));
        continue;
      }
      const child = findGroup(m);
      if (child) {
        const cg = visit(child, depth + 1);
        if (cg) {
          points.push(...cg.poly);
          boxes.push(cg.bbox);
        }
      }
    }
    if (!points.length) {
      memo.set(g.id, null);
      return null;
    }
    const pad = Math.max(0, g.padding || 0);
    let poly;
    let radius = 0;
    if (g.outline === 'hull') {
      poly = G.paddedHull(points, pad);
    } else if (g.outline === 'ortho') {
      poly = G.orthoOutline(boxes.map((b) => G.inflate(b, pad)), Math.max(12, pad * 1.5));
      radius = g.radius || 0;
    } else {
      poly = G.rectPolygon(G.inflate(G.bboxOf(points), pad));
      radius = g.radius || 0;
    }
    const geom = { poly, bbox: G.bboxOf(poly), path: G.polygonPath(poly, radius) };
    memo.set(g.id, geom);
    return geom;
  };
  for (const g of doc.groups) visit(g, 0);
  return memo;
}

/** Groups ordered so outer groups draw beneath inner ones. */
function groupsByDepth() {
  return doc.groups.slice().sort((a, b) => ancestors(a.id).length - ancestors(b.id).length);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function nodeTransform(n) {
  return 'translate(' + r2(n.x) + ' ' + r2(n.y) + ')' +
    (n.rotation ? ' rotate(' + r2(n.rotation) + ' ' + r2(n.w / 2) + ' ' + r2(n.h / 2) + ')' : '');
}

function paintFor(item) {
  const sw = item.strokeWidth !== undefined ? item.strokeWidth : 2;
  const stroke = colorCss(item.stroke);
  return {
    fill: colorCss(item.fill),
    stroke,
    sw,
    dash: dashCss(item.dash, sw),
    ink: colorCss('ink'),
    pin: stroke === 'none' ? colorCss('ink') : stroke,
  };
}

function nodeMarkup(n, forExport) {
  const def = S.get(n.type);
  let s = '<g class="fd-node" data-kind="node" data-id="' + n.id + '" transform="' + nodeTransform(n) + '">';
  if (!forExport) s += '<rect class="fd-hit-body" x="0" y="0" width="' + r2(n.w) + '" height="' + r2(n.h) + '"/>';
  try {
    s += def.draw(n, paintFor(n));
  } catch (err) {
    s += '<rect width="' + n.w + '" height="' + n.h + '" style="fill:none;stroke:red"/>';
  }
  if (!def.noLabel && n.label && n.label.text) {
    const a = nodeLabelAnchor(n);
    s += labelMarkup(n.label, a.x, a.y, n.label.rotation,
      forExport ? '' : 'class="fd-label" data-kind="nlabel" data-id="' + n.id + '"', { forExport });
  }
  return s + '</g>';
}

function arrowMarkup(kind, tip, angle, sw, color) {
  if (!kind || kind === 'none') return '';
  const len = 8 + sw * 2.5;
  const half = len * 0.42;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const back = { x: tip.x - ca * len, y: tip.y - sa * len };
  const l = { x: back.x - sa * half, y: back.y + ca * half };
  const r = { x: back.x + sa * half, y: back.y - ca * half };
  const pt = (p) => r2(p.x) + ',' + r2(p.y);
  if (kind === 'arrow') {
    return '<polygon points="' + pt(tip) + ' ' + pt(l) + ' ' + pt(r) + '" style="fill:' + color + ';stroke:' + color +
      ';stroke-width:1;stroke-linejoin:round"/>';
  }
  if (kind === 'open') {
    return '<polyline points="' + pt(l) + ' ' + pt(tip) + ' ' + pt(r) + '" style="fill:none;stroke:' + color +
      ';stroke-width:' + sw + ';stroke-linejoin:round;stroke-linecap:round"/>';
  }
  if (kind === 'dot') {
    const rad = 2.5 + sw;
    return '<circle cx="' + r2(tip.x - ca * rad) + '" cy="' + r2(tip.y - sa * rad) + '" r="' + r2(rad) +
      '" style="fill:' + color + ';stroke:none"/>';
  }
  if (kind === 'bar') {
    const bl = { x: tip.x - sa * half * 1.2, y: tip.y + ca * half * 1.2 };
    const br = { x: tip.x + sa * half * 1.2, y: tip.y - ca * half * 1.2 };
    return '<line x1="' + r2(bl.x) + '" y1="' + r2(bl.y) + '" x2="' + r2(br.x) + '" y2="' + r2(br.y) +
      '" style="stroke:' + color + ';stroke-width:' + sw + ';stroke-linecap:round"/>';
  }
  return '';
}

function arrowInset(kind, sw) {
  if (kind === 'arrow') return (8 + sw * 2.5) * 0.75;
  if (kind === 'dot') return 2.5 + sw;
  return 0;
}

/** Moves a polyline's end back by d along its last segment. */
function trimEnd(pts, d, atStart) {
  if (!(d > 0) || pts.length < 2) return pts;
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  const i = atStart ? 0 : out.length - 1;
  const j = atStart ? 1 : out.length - 2;
  const len = G.dist(out[i], out[j]);
  if (len <= d + 1) return out;
  out[i] = G.lerp(out[i], out[j], d / len);
  return out;
}

function edgePathD(geom, trimS, trimE) {
  if (geom.kind === 'curve') {
    const a = trimS ? G.lerp(geom.a, geom.c, Math.min(0.9, trimS / (G.dist(geom.a, geom.c) || 1))) : geom.a;
    const b = trimE ? G.lerp(geom.b, geom.c, Math.min(0.9, trimE / (G.dist(geom.b, geom.c) || 1))) : geom.b;
    return 'M' + r2(a.x) + ' ' + r2(a.y) + ' Q' + r2(geom.c.x) + ' ' + r2(geom.c.y) + ' ' + r2(b.x) + ' ' + r2(b.y);
  }
  return G.polylinePath(trimEnd(trimEnd(geom.pts, trimS, true), trimE, false));
}

function endAngles(geom) {
  const pts = geom.pts;
  const n = pts.length;
  let a = pts[1];
  let b = pts[n - 2];
  if (geom.kind === 'curve') {
    a = G.samePoint(geom.c, geom.a) ? geom.b : geom.c;
    b = G.samePoint(geom.c, geom.b) ? geom.a : geom.c;
  }
  return {
    start: Math.atan2(pts[0].y - a.y, pts[0].x - a.x),
    end: Math.atan2(pts[n - 1].y - b.y, pts[n - 1].x - b.x),
  };
}

function edgeMarkup(e, forExport, geom) {
  const g = geom || edgeGeom(e);
  const p = paintFor(e);
  const color = p.stroke === 'none' ? colorCss('ink') : p.stroke;
  const ang = endAngles(g);
  const d = edgePathD(g, arrowInset(e.arrowStart, p.sw), arrowInset(e.arrowEnd, p.sw));
  let s = '<g class="fd-edge" data-kind="edge" data-id="' + e.id + '">';
  if (!forExport) {
    if (g.kind === 'ortho') {
      for (let i = 0; i < g.pts.length - 1; i++) {
        const a = g.pts[i];
        const b = g.pts[i + 1];
        const horiz = Math.abs(a.y - b.y) < G.EPS;
        s += '<path class="fd-hit ' + (horiz ? 'seg-h' : 'seg-v') + '" data-seg="' + i + '" d="M' + r2(a.x) + ' ' +
          r2(a.y) + ' L' + r2(b.x) + ' ' + r2(b.y) + '" style="stroke-width:' + r2(12 / view.zoom + p.sw) + '"/>';
      }
    } else {
      s += '<path class="fd-hit" d="' + edgePathD(g, 0, 0) + '" style="stroke-width:' + r2(12 / view.zoom + p.sw) + '"/>';
    }
  }
  s += '<path d="' + d + '" style="fill:none;stroke:' + color + ';stroke-width:' + p.sw +
    ';stroke-linejoin:round;stroke-linecap:' + (p.dash ? 'butt' : 'round') + (p.dash ? ';stroke-dasharray:' + p.dash : '') + '"/>';
  s += arrowMarkup(e.arrowStart, g.pts[0], ang.start, p.sw, color);
  s += arrowMarkup(e.arrowEnd, g.pts[g.pts.length - 1], ang.end, p.sw, color);
  if (e.busWidth !== undefined && e.busWidth !== '' && e.busWidth !== null) {
    const bp = G.pointAlong(g.pts, e.busPos !== undefined ? e.busPos : 0.5);
    const deg = bp.angle * 180 / Math.PI;
    s += '<g transform="translate(' + r2(bp.x) + ' ' + r2(bp.y) + ') rotate(' + r2(deg) + ')">' +
      '<line x1="-5" y1="8" x2="5" y2="-8" style="stroke:' + color + ';stroke-width:' + p.sw + ';stroke-linecap:round"/></g>';
    const vertical = Math.abs(Math.sin(bp.angle)) > 0.7;
    const tx = bp.x + (vertical ? 10 : 6);
    const ty = bp.y + (vertical ? 0 : -14);
    s += '<text x="' + r2(tx) + '" y="' + r2(ty) + '" text-anchor="start" dominant-baseline="central" style="fill:' +
      color + ';stroke:none;font-size:12px">' + esc(e.busWidth) + '</text>';
  }
  (e.labels || []).forEach((lab, i) => {
    if (!lab.text && forExport) return;
    const lp = edgeLabelPoint(g, lab);
    s += labelMarkup(lab.text ? lab : Object.assign({}, lab, { text: ' ' }), lp.x, lp.y, lab.rotation,
      forExport ? '' : 'class="fd-label" data-kind="elabel" data-id="' + e.id + '" data-idx="' + i + '"', { forExport });
  });
  return s + '</g>';
}

function groupMarkup(g, geom, forExport) {
  if (!geom) return '';
  const p = paintFor(g);
  let s = '<g class="fd-group" data-kind="group" data-id="' + g.id + '">';
  if (p.fill !== 'none') s += '<path d="' + geom.path + '" style="fill:' + p.fill + ';stroke:none"/>';
  if (p.stroke !== 'none') {
    s += '<path d="' + geom.path + '" style="fill:none;stroke:' + p.stroke + ';stroke-width:' + p.sw +
      ';stroke-linejoin:round' + (p.dash ? ';stroke-dasharray:' + p.dash : '') + '"/>';
  }
  if (!forExport) {
    s += '<path class="fd-hit fd-group-hit" d="' + geom.path + '" style="stroke-width:' + r2(10 / view.zoom) + '"/>';
  }
  if (g.label && g.label.text) {
    const a = groupLabelAnchor(g, geom);
    s += labelMarkup(g.label, a.x, a.y, g.label.rotation,
      forExport ? '' : 'class="fd-label" data-kind="glabel" data-id="' + g.id + '"', { forExport });
  }
  return s + '</g>';
}

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  const geoms = computeGroupGeoms();
  let gs = '';
  for (const g of groupsByDepth()) gs += groupMarkup(g, geoms.get(g.id), false);
  el.layerGroups.innerHTML = gs;
  let es = '';
  for (const e of doc.edges) es += edgeMarkup(e, false);
  el.layerEdges.innerHTML = es;
  let ns = '';
  for (const n of doc.nodes) ns += nodeMarkup(n, false);
  el.layerNodes.innerHTML = ns;
  renderOverlay(geoms);
  el.emptyHint.classList.toggle('hidden', doc.nodes.length > 0 || doc.edges.length > 0);
}

function updateViewTransform() {
  el.world.setAttribute('transform', 'translate(' + r2(view.x) + ' ' + r2(view.y) + ') scale(' + view.zoom + ')');
  const size = doc.grid.size || 10;
  const tf = 'translate(' + r2(view.x) + ' ' + r2(view.y) + ') scale(' + view.zoom + ')';
  el.gridMinor.setAttribute('width', size);
  el.gridMinor.setAttribute('height', size);
  el.gridMinorPath.setAttribute('d', 'M' + size + ' 0 H0 V' + size);
  el.gridMajor.setAttribute('width', size * 10);
  el.gridMajor.setAttribute('height', size * 10);
  el.gridMajorPath.setAttribute('d', 'M' + size * 10 + ' 0 H0 V' + size * 10);
  el.gridMinor.setAttribute('patternTransform', tf);
  el.gridMajor.setAttribute('patternTransform', tf);
  const show = doc.grid.show !== false;
  el.gridMinorRect.classList.toggle('hidden', !show || size * view.zoom < 6);
  el.gridMajorRect.classList.toggle('hidden', !show);
  el.zoomBadge.textContent = Math.round(view.zoom * 100) + '%';
}

// ------------------------------------------------------------- Overlay

function handleRect(x, y, name, id, cls) {
  const hs = 8 / view.zoom;
  return '<rect class="handle ' + (cls || 'handle-' + name) + '" data-kind="handle" data-h="' + name + '"' +
    (id ? ' data-id="' + id + '"' : '') + ' x="' + r2(x - hs / 2) + '" y="' + r2(y - hs / 2) + '" width="' + r2(hs) +
    '" height="' + r2(hs) + '" style="stroke-width:' + r2(1.5 / view.zoom) + '"/>';
}

function handleCircle(x, y, name, id, cls, extra) {
  const r = 5 / view.zoom;
  return '<circle class="handle ' + cls + '" data-kind="handle" data-h="' + name + '"' + (id ? ' data-id="' + id + '"' : '') +
    (extra || '') + ' cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" style="stroke-width:' + r2(1.5 / view.zoom) + '"/>';
}

function rotateHandle(x, y, anchorX, anchorY, name, id) {
  return '<line class="handle-line" x1="' + r2(anchorX) + '" y1="' + r2(anchorY) + '" x2="' + r2(x) + '" y2="' + r2(y) +
    '" style="stroke-width:' + r2(1 / view.zoom) + '"/>' + handleCircle(x, y, name, id, 'handle-rot');
}

function parseKey(k) {
  const parts = k.split(':');
  if (parts[0] === 'l') return { kind: 'label', owner: parts[1], id: parts[2], idx: parts[3] !== undefined ? Number(parts[3]) : null };
  return { kind: { n: 'node', e: 'edge', g: 'group' }[parts[0]], id: parts[1] };
}

function selectedOf(kind) {
  const out = [];
  for (const k of selection) {
    const p = parseKey(k);
    if (p.kind === kind) out.push(p.id);
  }
  return out;
}

function selectedLabel() {
  if (selection.size !== 1) return null;
  const p = parseKey([...selection][0]);
  return p.kind === 'label' ? p : null;
}

/** Node ids moved by the current selection (groups expand to their nodes). */
function selectedNodesDeep() {
  const set = new Set(selectedOf('node'));
  for (const gid of selectedOf('group')) groupNodesDeep(gid, set);
  return set;
}

function labelOf(p) {
  if (p.owner === 'n') {
    const n = findNode(p.id);
    return n ? n.label : null;
  }
  if (p.owner === 'g') {
    const g = findGroup(p.id);
    return g ? g.label : null;
  }
  const e = findEdge(p.id);
  return e && e.labels ? e.labels[p.idx] : null;
}

/** World centre and world rotation of a selected label. */
function labelFrame(p, geoms) {
  if (p.owner === 'n') {
    const n = findNode(p.id);
    const a = nodeLabelAnchor(n);
    return { c: G.localToWorld(n, a), rot: (n.rotation || 0) + (n.label.rotation || 0), base: n.rotation || 0 };
  }
  if (p.owner === 'g') {
    const g = findGroup(p.id);
    const geom = (geoms || computeGroupGeoms()).get(g.id);
    return geom ? { c: groupLabelAnchor(g, geom), rot: g.label.rotation || 0, base: 0 } : null;
  }
  const e = findEdge(p.id);
  const lab = e.labels[p.idx];
  return { c: edgeLabelPoint(edgeGeom(e), lab), rot: lab.rotation || 0, base: 0 };
}

function selectionBBox(geoms) {
  let box = null;
  for (const id of selectedNodesDeep()) {
    const n = findNode(id);
    if (n) box = G.unionBox(box, G.nodeBBox(n));
  }
  for (const gid of selectedOf('group')) {
    const geom = geoms.get(gid);
    if (geom) box = G.unionBox(box, geom.bbox);
  }
  for (const eid of selectedOf('edge')) {
    const e = findEdge(eid);
    if (e) box = G.unionBox(box, G.bboxOf(edgeGeom(e).pts));
  }
  return box;
}

function renderOverlay(geoms) {
  geoms = geoms || computeGroupGeoms();
  const z = view.zoom;
  let s = '';
  const nodesSel = selectedOf('node');
  const groupsSel = selectedOf('group');
  const edgesSel = selectedOf('edge');
  const single = selection.size === 1;

  for (const gid of groupsSel) {
    const geom = geoms.get(gid);
    if (geom) s += '<path class="sel-group" d="' + geom.path + '" style="stroke-width:' + r2(1.5 / z) + '"/>';
  }
  for (const id of nodesSel) {
    const n = findNode(id);
    if (!n) continue;
    const pad = 3 / z;
    s += '<g transform="' + nodeTransform(n) + '">';
    s += '<rect class="sel-box" x="' + r2(-pad) + '" y="' + r2(-pad) + '" width="' + r2(n.w + 2 * pad) + '" height="' +
      r2(n.h + 2 * pad) + '" style="stroke-width:' + r2(1.2 / z) + '"/>';
    if (single) {
      const hx = { nw: [0, 0], n: [n.w / 2, 0], ne: [n.w, 0], e: [n.w, n.h / 2], se: [n.w, n.h], s: [n.w / 2, n.h],
        sw: [0, n.h], w: [0, n.h / 2] };
      for (const [name, [x, y]] of Object.entries(hx)) s += handleRect(x, y, name, id);
      s += rotateHandle(n.w / 2, -26 / z, n.w / 2, -pad, 'rot', id);
    }
    s += '</g>';
  }
  if (!single && (nodesSel.length + groupsSel.length) > 0 || (single && groupsSel.length === 1)) {
    const box = selectionBBox(geoms);
    if (box) {
      if (!single) {
        s += '<rect class="sel-box" x="' + r2(box.x - 6 / z) + '" y="' + r2(box.y - 6 / z) + '" width="' + r2(box.w + 12 / z) +
          '" height="' + r2(box.h + 12 / z) + '" style="stroke-width:' + r2(1 / z) + '"/>';
      }
      s += rotateHandle(box.x + box.w / 2, box.y - 30 / z, box.x + box.w / 2, box.y - 6 / z, 'srot');
    }
  }
  for (const eid of edgesSel) {
    const e = findEdge(eid);
    if (!e) continue;
    const g = edgeGeom(e);
    s += '<path class="sel-edge" d="' + edgePathD(g, 0, 0) + '" style="stroke-width:' + r2((e.strokeWidth || 2) + 6 / z) + '"/>';
    if (single) {
      if (g.kind === 'ortho') {
        for (let i = 0; i < g.pts.length - 1; i++) {
          const a = g.pts[i];
          const b = g.pts[i + 1];
          if (G.dist(a, b) < 18 / z) continue;
          const m = G.lerp(a, b, 0.5);
          s += handleRect(m.x, m.y, 'seg', eid, 'handle-seg').replace('data-h="seg"', 'data-h="seg" data-seg="' + i + '"');
        }
      } else if (g.kind === 'curve') {
        const m = G.quadPoint(g.a, g.c, g.b, 0.5);
        s += '<line class="handle-line" x1="' + r2(g.a.x) + '" y1="' + r2(g.a.y) + '" x2="' + r2(g.c.x) + '" y2="' + r2(g.c.y) +
          '" style="stroke-width:' + r2(1 / z) + ';stroke-dasharray:' + r2(3 / z) + '"/>';
        s += '<line class="handle-line" x1="' + r2(g.b.x) + '" y1="' + r2(g.b.y) + '" x2="' + r2(g.c.x) + '" y2="' + r2(g.c.y) +
          '" style="stroke-width:' + r2(1 / z) + ';stroke-dasharray:' + r2(3 / z) + '"/>';
        s += handleCircle(m.x, m.y, 'curve', eid, 'handle-curve');
      } else if (!e.from.node || !e.to.node) {
        const m = G.lerp(g.pts[0], g.pts[1], 0.5);
        s += handleRect(m.x, m.y, 'emove', eid, 'handle-move');
      }
      s += handleCircle(g.pts[0].x, g.pts[0].y, 'from', eid, 'handle');
      s += handleCircle(g.pts[g.pts.length - 1].x, g.pts[g.pts.length - 1].y, 'to', eid, 'handle');
    }
  }
  const lsel = selectedLabel();
  if (lsel) {
    const lab = labelOf(lsel);
    const fr = lab ? labelFrame(lsel, geoms) : null;
    if (fr) {
      const box = labelBox(lab.text ? lab : Object.assign({}, lab, { text: ' ' }));
      s += '<g transform="translate(' + r2(fr.c.x) + ' ' + r2(fr.c.y) + ') rotate(' + r2(fr.rot) + ')">';
      s += '<rect class="sel-box" x="' + r2(-box.w / 2 - 3 / z) + '" y="' + r2(-box.h / 2 - 3 / z) + '" width="' +
        r2(box.w + 6 / z) + '" height="' + r2(box.h + 6 / z) + '" style="stroke-width:' + r2(1.2 / z) + '"/>';
      s += rotateHandle(0, -box.h / 2 - 22 / z, 0, -box.h / 2 - 3 / z, 'lrot');
      s += '</g>';
    }
  }
  // Port dots on the hovered shape (or the shape under an arrow being drawn).
  const portNode = (drag && drag.portNode) || (!drag && hoverNode) || null;
  const pn = portNode ? findNode(portNode) : null;
  if (pn) {
    const hot = drag && drag.target && drag.target.node === pn.id ? drag.target.port : null;
    for (const lp of nodePortsLocal(pn)) {
      const w = portWorld(pn, lp);
      s += '<circle class="port-dot' + (hot === lp.id ? ' hot' : '') + '" data-kind="port" data-id="' + pn.id +
        '" data-port="' + lp.id + '" cx="' + r2(w.pt.x) + '" cy="' + r2(w.pt.y) + '" r="' + r2(4.5 / z) +
        '" style="stroke-width:' + r2(1.5 / z) + '"><title>' + esc(lp.label || lp.id) + '</title></circle>';
    }
  }
  if (drag && drag.target && drag.target.node && !drag.target.port) {
    const t = resolveEnd(drag.target);
    s += '<circle class="snap-target" cx="' + r2(t.pt.x) + '" cy="' + r2(t.pt.y) + '" r="' + r2(6 / z) +
      '" style="stroke-width:' + r2(2 / z) + '"/>';
  }
  if (drag && drag.mode === 'marquee' && drag.moved) {
    const b = G.bboxOf([drag.start, drag.cur]);
    s += '<rect class="marquee" x="' + r2(b.x) + '" y="' + r2(b.y) + '" width="' + r2(b.w) + '" height="' + r2(b.h) +
      '" style="stroke-width:' + r2(1 / z) + '"/>';
  }
  if (drag && drag.mode === 'edge-draw') {
    const temp = previewEdge();
    if (temp) {
      s += '<path class="draw-preview" d="' + edgePathD(edgeGeom(temp), 0, 0) + '" style="stroke-width:' + r2(2 / z) + '"/>';
    }
  }
  el.layerOverlay.innerHTML = s;
}

// ---------------------------------------------------------------------------
// History (undo / redo) and autosave
// ---------------------------------------------------------------------------
function snapshotDoc() {
  return JSON.stringify({ name: doc.name, nodes: doc.nodes, edges: doc.edges, groups: doc.groups, nextId: doc.nextId });
}

function initHistory(label) {
  history = [{ label, snap: snapshotDoc() }];
  historyIndex = 0;
  lastCommit = { label: '', time: 0, index: -1 };
  updateHistoryUI();
  updateToolbar();
}

/**
 * Records the current document as a new history entry. With coalesce, a
 * repeat of the same action within a moment replaces the previous entry
 * (keyboard nudges, colour picker drags, typing in a field).
 */
function commit(label, opts = {}) {
  const snap = snapshotDoc();
  if (history.length && snap === history[historyIndex].snap) return;
  history.length = historyIndex + 1;
  const now = Date.now();
  if (opts.coalesce && lastCommit.label === label && lastCommit.index === historyIndex && historyIndex > 0 &&
    now - lastCommit.time < 1200) {
    history[historyIndex] = { label, snap };
  } else {
    history.push({ label, snap });
    historyIndex++;
  }
  while (history.length > MAX_UNDO + 1) {
    history.shift();
    historyIndex--;
  }
  lastCommit = { label, time: now, index: historyIndex };
  scheduleAutosave();
  updateHistoryUI();
  updateToolbar();
}

function restoreHistory(i) {
  if (i < 0 || i >= history.length) return;
  historyIndex = i;
  const data = JSON.parse(history[i].snap);
  doc.name = data.name;
  doc.nodes = data.nodes;
  doc.edges = data.edges;
  doc.groups = data.groups;
  doc.nextId = data.nextId;
  lastCommit = { label: '', time: 0, index: -1 };
  routeCache.clear();
  pruneSelection();
  el.docName.value = doc.name;
  render();
  renderProps();
  updateHistoryUI();
  updateToolbar();
  scheduleAutosave();
}

function undo() {
  if (historyIndex > 0) {
    const label = history[historyIndex].label;
    restoreHistory(historyIndex - 1);
    toast('Undid: ' + label);
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    restoreHistory(historyIndex + 1);
    toast('Redid: ' + history[historyIndex].label);
  }
}

function updateHistoryUI() {
  el.undoBtn.disabled = historyIndex <= 0;
  el.redoBtn.disabled = historyIndex >= history.length - 1;
  el.undoBtn.title = historyIndex > 0 ? 'Undo ' + history[historyIndex].label + ' (Ctrl+Z)' : 'Undo (Ctrl+Z)';
  el.redoBtn.title = historyIndex < history.length - 1 ? 'Redo ' + history[historyIndex + 1].label + ' (Ctrl+Y)' : 'Redo (Ctrl+Y)';
  if (el.historyPanel.classList.contains('hidden')) return;
  const frag = document.createDocumentFragment();
  history.forEach((h, i) => {
    const li = document.createElement('li');
    li.textContent = h.label;
    li.title = i === historyIndex ? 'Current state' : 'Click to go back to this point';
    if (i === historyIndex) li.classList.add('current');
    if (i > historyIndex) li.classList.add('future');
    li.addEventListener('click', () => restoreHistory(i));
    frag.appendChild(li);
  });
  el.historyList.innerHTML = '';
  el.historyList.appendChild(frag);
  const cur = el.historyList.querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function toggleHistory(show) {
  const visible = show !== undefined ? show : el.historyPanel.classList.contains('hidden');
  el.historyPanel.classList.toggle('hidden', !visible);
  el.historyBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  uiPrefs.history = visible;
  saveUiPrefs();
  updateHistoryUI();
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, IO.toJSON(Object.assign({}, doc, { view })));
    } catch (err) {
      // Storage full or blocked: autosave is a convenience, so stay quiet.
    }
  }, 400);
}

function saveUiPrefs() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(uiPrefs));
  } catch (err) {
    // ignore
  }
}

function loadUiPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (v && typeof v === 'object') uiPrefs = Object.assign(uiPrefs, v);
  } catch (err) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
function pruneSelection() {
  for (const k of [...selection]) {
    const p = parseKey(k);
    let ok;
    if (p.kind === 'node') ok = !!findNode(p.id);
    else if (p.kind === 'edge') ok = !!findEdge(p.id);
    else if (p.kind === 'group') ok = !!findGroup(p.id);
    else ok = !!labelOf(p);
    if (!ok) selection.delete(k);
  }
}

function setSelection(keys) {
  selection = new Set(keys);
  if (editing) finishEdit(true);
  renderOverlay();
  renderProps();
  updateToolbar();
}

/** Keys from outermost group down to the node itself. */
function selectionChain(nodeId) {
  return ancestors(nodeId).map((g) => 'g:' + g).concat('n:' + nodeId);
}

// ---------------------------------------------------------------------------
// Mutations shared by drags, keys and menus
// ---------------------------------------------------------------------------

/** Snapshot of the geometry a move/rotate drag may change. */
function captureBase(nodeIds) {
  const nodes = new Map();
  for (const id of nodeIds) {
    const n = findNode(id);
    if (n) nodes.set(id, { x: n.x, y: n.y, w: n.w, h: n.h, rotation: n.rotation || 0 });
  }
  const edges = new Map();
  for (const e of doc.edges) edges.set(e.id, deepCopy({ from: e.from, to: e.to, waypoints: e.waypoints, curve: e.curve, labels: e.labels }));
  return { nodes, edges };
}

function restoreBase(base) {
  for (const [id, b] of base.nodes) {
    const n = findNode(id);
    if (n) Object.assign(n, b);
  }
  for (const [id, b] of base.edges) {
    const e = findEdge(id);
    if (e) {
      const c = deepCopy(b);
      e.from = c.from;
      e.to = c.to;
      e.waypoints = c.waypoints;
      e.curve = c.curve;
      e.labels = c.labels;
    }
  }
}

function edgeEndMoves(end, nodeSet, edgeSelected) {
  return end.node ? nodeSet.has(end.node) : edgeSelected;
}

/**
 * Translates nodes (and the parts of edges that should follow them). Manual
 * 90° routes whose far end stays put get their first/last segment slid so
 * the route keeps its shape instead of growing an extra bend.
 */
function translateNodes(nodeSet, dx, dy, edgeSet = new Set()) {
  const slide = [];
  for (const e of doc.edges) {
    const sel = edgeSet.has(e.id);
    const fm = edgeEndMoves(e.from, nodeSet, sel);
    const tm = edgeEndMoves(e.to, nodeSet, sel);
    if (fm !== tm && e.manual && e.waypoints.length) {
      slide.push({ e, fm, tm, oldS: resolveEnd(e.from).pt, oldE: resolveEnd(e.to).pt });
    }
  }
  for (const id of nodeSet) {
    const n = findNode(id);
    if (n) {
      n.x += dx;
      n.y += dy;
    }
  }
  for (const e of doc.edges) {
    const sel = edgeSet.has(e.id);
    const fm = edgeEndMoves(e.from, nodeSet, sel);
    const tm = edgeEndMoves(e.to, nodeSet, sel);
    if (!fm && !tm) continue;
    if (!e.from.node && fm) {
      e.from.x += dx;
      e.from.y += dy;
    }
    if (!e.to.node && tm) {
      e.to.x += dx;
      e.to.y += dy;
    }
    if (fm && tm) {
      for (const w of e.waypoints) {
        w.x += dx;
        w.y += dy;
      }
    }
  }
  for (const { e, fm, oldS, oldE } of slide) {
    const w = fm ? e.waypoints[0] : e.waypoints[e.waypoints.length - 1];
    const old = fm ? oldS : oldE;
    if (Math.abs(w.y - old.y) < G.EPS) w.y += dy;
    else if (Math.abs(w.x - old.x) < G.EPS) w.x += dx;
  }
}

/** Rotates nodes about a centre (positions and orientations). */
function rotateNodes(nodeSet, c, delta, edgeSet = new Set()) {
  for (const id of nodeSet) {
    const n = findNode(id);
    if (!n) continue;
    const nc = G.rotate(G.center(n), c, delta);
    n.x = r2(nc.x - n.w / 2);
    n.y = r2(nc.y - n.h / 2);
    n.rotation = normAngle((n.rotation || 0) + delta);
  }
  for (const e of doc.edges) {
    const sel = edgeSet.has(e.id);
    const fm = edgeEndMoves(e.from, nodeSet, sel);
    const tm = edgeEndMoves(e.to, nodeSet, sel);
    if (!e.from.node && fm) Object.assign(e.from, G.rotate(e.from, c, delta));
    if (!e.to.node && tm) Object.assign(e.to, G.rotate(e.to, c, delta));
    if (fm && tm) e.waypoints = e.waypoints.map((w) => G.rotate(w, c, delta)).map((w) => ({ x: r2(w.x), y: r2(w.y) }));
  }
}

function deleteSelection() {
  const lsel = selectedLabel();
  if (lsel) {
    if (lsel.owner === 'e') {
      const e = findEdge(lsel.id);
      e.labels.splice(lsel.idx, 1);
      setSelection(['e:' + e.id]);
    } else {
      labelOf(lsel).text = '';
      setSelection([lsel.owner === 'n' ? 'n:' + lsel.id : 'g:' + lsel.id]);
    }
    render();
    commit('Delete label');
    return;
  }
  if (!selection.size) return;
  const nodeSet = selectedNodesDeep();
  const groupSet = new Set();
  for (const gid of selectedOf('group')) groupGroupsDeep(gid, groupSet);
  const edgeSet = new Set(selectedOf('edge'));
  // Arrows attached to deleted shapes stay behind as free-ended arrows.
  for (const e of doc.edges) {
    if (edgeSet.has(e.id)) continue;
    for (const which of ['from', 'to']) {
      if (e[which].node && nodeSet.has(e[which].node)) {
        const pt = resolveEnd(e[which]).pt;
        e[which] = { x: r2(pt.x), y: r2(pt.y) };
      }
    }
  }
  doc.nodes = doc.nodes.filter((n) => !nodeSet.has(n.id));
  doc.edges = doc.edges.filter((e) => !edgeSet.has(e.id));
  doc.groups = doc.groups.filter((g) => !groupSet.has(g.id));
  for (const g of doc.groups) g.members = g.members.filter((m) => !nodeSet.has(m) && !groupSet.has(m));
  cleanupGroups();
  const count = nodeSet.size + edgeSet.size;
  setSelection([]);
  render();
  commit(count === 1 ? 'Delete item' : 'Delete ' + count + ' items');
}

function cleanupGroups() {
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set(doc.groups.map((g) => g.id));
    for (const g of doc.groups) {
      const before = g.members.length;
      g.members = g.members.filter((m) => findNode(m) || ids.has(m));
      if (g.members.length !== before) changed = true;
    }
    const keep = doc.groups.filter((g) => g.members.length > 0);
    if (keep.length !== doc.groups.length) {
      doc.groups = keep;
      changed = true;
    }
  }
}

/** Selected top-level items (nodes/groups whose ancestors aren't selected). */
function selectedUnits() {
  const keys = [...selection].filter((k) => k.startsWith('n:') || k.startsWith('g:'));
  return keys.filter((k) => {
    const id = k.slice(2);
    return !ancestors(id).some((a) => selection.has('g:' + a));
  });
}

function groupSelection() {
  const units = selectedUnits();
  if (!units.length) return;
  const ids = units.map((k) => k.slice(2));
  const parents = ids.map((id) => parentOf(id));
  const common = parents.every((p) => p === parents[0]) ? parents[0] : null;
  for (let i = 0; i < ids.length; i++) {
    if (parents[i]) parents[i].members = parents[i].members.filter((m) => m !== ids[i]);
  }
  const g = makeGroup(ids);
  doc.groups.push(g);
  if (common) common.members.push(g.id);
  cleanupGroups();
  setSelection(['g:' + g.id]);
  render();
  commit('Group ' + ids.length + (ids.length === 1 ? ' item' : ' items'));
}

function ungroupSelection() {
  const gids = selectedOf('group');
  if (!gids.length) return;
  const keys = [];
  for (const gid of gids) {
    const g = findGroup(gid);
    if (!g) continue;
    const parent = parentOf(gid);
    if (parent) {
      const at = parent.members.indexOf(gid);
      parent.members.splice(at, 1, ...g.members);
    }
    doc.groups = doc.groups.filter((x) => x.id !== gid);
    for (const m of g.members) keys.push((findGroup(m) ? 'g:' : 'n:') + m);
  }
  setSelection(keys);
  render();
  commit('Ungroup');
}

function reorder(toFront) {
  const set = selectedNodesDeep();
  if (!set.size) return;
  const picked = doc.nodes.filter((n) => set.has(n.id));
  const rest = doc.nodes.filter((n) => !set.has(n.id));
  doc.nodes = toFront ? rest.concat(picked) : picked.concat(rest);
  render();
  commit(toFront ? 'Bring to front' : 'Send to back');
}

function rotateSelection(delta) {
  const lsel = selectedLabel();
  if (lsel) {
    const lab = labelOf(lsel);
    lab.rotation = normAngle(Math.round(((lab.rotation || 0) + delta) / ROTATE_SNAP) * ROTATE_SNAP);
    render();
    renderProps();
    commit('Rotate label');
    return;
  }
  const set = selectedNodesDeep();
  if (!set.size) return;
  const box = selectionBBox(computeGroupGeoms());
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  rotateNodes(set, c, delta, new Set(selectedOf('edge')));
  render();
  renderProps();
  commit('Rotate ' + (delta > 0 ? '90° clockwise' : '90° anticlockwise'));
}

function nudge(dx, dy) {
  const set = selectedNodesDeep();
  const edges = new Set(selectedOf('edge'));
  const lsel = selectedLabel();
  if (lsel) {
    const lab = labelOf(lsel);
    lab.dx = (lab.dx || 0) + dx;
    lab.dy = (lab.dy || 0) + dy;
  } else if (set.size || edges.size) {
    translateNodes(set, dx, dy, edges);
  } else {
    return;
  }
  render();
  commit('Nudge', { coalesce: true });
}

function unitBox(key, geoms) {
  const id = key.slice(2);
  if (key.startsWith('n:')) return G.nodeBBox(findNode(id));
  let box = null;
  for (const nid of groupNodesDeep(id)) box = G.unionBox(box, G.nodeBBox(findNode(nid)));
  return box || (geoms.get(id) && geoms.get(id).bbox);
}

function unitNodes(key) {
  const id = key.slice(2);
  return key.startsWith('n:') ? new Set([id]) : groupNodesDeep(id);
}

function alignSelection(mode) {
  const units = selectedUnits();
  if (units.length < 2) return;
  const geoms = computeGroupGeoms();
  const items = units.map((k) => ({ k, b: unitBox(k, geoms) })).filter((u) => u.b);
  const all = items.reduce((acc, u) => G.unionBox(acc, u.b), null);
  if (mode === 'hdist' || mode === 'vdist') {
    const horiz = mode === 'hdist';
    items.sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
    const total = items.reduce((s, u) => s + (horiz ? u.b.w : u.b.h), 0);
    const gap = ((horiz ? all.w : all.h) - total) / (items.length - 1);
    let pos = horiz ? all.x : all.y;
    for (const u of items) {
      const d = pos - (horiz ? u.b.x : u.b.y);
      translateNodes(unitNodes(u.k), horiz ? d : 0, horiz ? 0 : d);
      pos += (horiz ? u.b.w : u.b.h) + gap;
    }
  } else {
    for (const u of items) {
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = all.x - u.b.x;
      if (mode === 'right') dx = all.x + all.w - (u.b.x + u.b.w);
      if (mode === 'hcenter') dx = all.x + all.w / 2 - (u.b.x + u.b.w / 2);
      if (mode === 'top') dy = all.y - u.b.y;
      if (mode === 'bottom') dy = all.y + all.h - (u.b.y + u.b.h);
      if (mode === 'vcenter') dy = all.y + all.h / 2 - (u.b.y + u.b.h / 2);
      translateNodes(unitNodes(u.k), dx, dy);
    }
  }
  render();
  commit('Align');
}

// ---------------------------------------------------------------- Clipboard

function copySelection() {
  const nodeSet = selectedNodesDeep();
  const groupSet = new Set();
  for (const gid of selectedOf('group')) groupGroupsDeep(gid, groupSet);
  const edgeSel = new Set(selectedOf('edge'));
  if (!nodeSet.size && !edgeSel.size) return false;
  const nodes = doc.nodes.filter((n) => nodeSet.has(n.id)).map(deepCopy);
  const groups = doc.groups.filter((g) => groupSet.has(g.id)).map(deepCopy);
  const edges = [];
  for (const e of doc.edges) {
    const inside = (end) => end.node && nodeSet.has(end.node);
    if (!edgeSel.has(e.id) && !(inside(e.from) && inside(e.to))) continue;
    const c = deepCopy(e);
    for (const which of ['from', 'to']) {
      if (c[which].node && !nodeSet.has(c[which].node)) {
        const pt = resolveEnd(e[which]).pt;
        c[which] = { x: pt.x, y: pt.y };
      }
    }
    edges.push(c);
  }
  clipboard = { nodes, edges, groups };
  pasteCount = 0;
  return true;
}

function pasteClipboard() {
  if (!clipboard) return;
  pasteCount++;
  const off = 20 * pasteCount;
  const data = deepCopy(clipboard);
  const map = new Map();
  for (const n of data.nodes) {
    map.set(n.id, newId('n'));
    n.id = map.get(n.id);
    n.x += off;
    n.y += off;
  }
  for (const g of data.groups) map.set(g.id, newId('g'));
  for (const g of data.groups) {
    g.id = map.get(g.id);
    g.members = g.members.map((m) => map.get(m)).filter(Boolean);
  }
  for (const e of data.edges) {
    e.id = newId('e');
    for (const which of ['from', 'to']) {
      if (e[which].node) e[which].node = map.get(e[which].node);
      else {
        e[which].x += off;
        e[which].y += off;
      }
    }
    e.waypoints = e.waypoints.map((w) => ({ x: w.x + off, y: w.y + off }));
  }
  doc.nodes.push(...data.nodes);
  doc.groups.push(...data.groups);
  doc.edges.push(...data.edges);
  const memberIds = new Set(data.groups.flatMap((g) => g.members));
  const keys = [];
  for (const n of data.nodes) if (!memberIds.has(n.id)) keys.push('n:' + n.id);
  for (const g of data.groups) if (!memberIds.has(g.id)) keys.push('g:' + g.id);
  for (const e of data.edges) keys.push('e:' + e.id);
  setSelection(keys);
  render();
  commit('Paste');
}

// ---------------------------------------------------------------------------
// Adding shapes
// ---------------------------------------------------------------------------
function addShape(type, p) {
  const def = S.get(type);
  if (def.kind === 'edge' || S.SHAPES.find((s) => s.id === type && s.kind === 'edge')) {
    const sdef = S.SHAPES.find((s) => s.id === type);
    const e = makeEdge({ x: snapV(p.x - 60), y: snapV(p.y) }, { x: snapV(p.x + 60), y: snapV(p.y) },
      Object.assign({ style: 'straight' }, sdef.edge));
    doc.edges.push(e);
    setSelection(['e:' + e.id]);
    render();
    commit('Add ' + sdef.name.toLowerCase());
    return;
  }
  const n = makeNode(type, p.x, p.y);
  doc.nodes.push(n);
  setSelection(['n:' + n.id]);
  render();
  commit('Add ' + def.name);
}

function viewCenterWorld() {
  const r = el.canvas.getBoundingClientRect();
  return { x: (r.width / 2 - view.x) / view.zoom, y: (r.height / 2 - view.y) / view.zoom };
}

// ---------------------------------------------------------------------------
// View: pan / zoom / fit
// ---------------------------------------------------------------------------
function zoomAt(factor, sx, sy) {
  const z = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  view.x = sx - (sx - view.x) * (z / view.zoom);
  view.y = sy - (sy - view.y) * (z / view.zoom);
  view.zoom = z;
  updateViewTransform();
  render();
  scheduleAutosave();
}

function zoomCentered(factor) {
  const r = el.canvas.getBoundingClientRect();
  zoomAt(factor, r.width / 2, r.height / 2);
}

function contentBBox(onlySelection) {
  const geoms = computeGroupGeoms();
  let box = null;
  const nodeSet = onlySelection ? selectedNodesDeep() : null;
  const edgeSet = onlySelection ? new Set(selectedOf('edge')) : null;
  for (const n of doc.nodes) {
    if (nodeSet && !nodeSet.has(n.id)) continue;
    box = G.unionBox(box, G.nodeBBox(n));
    if (n.label && n.label.text && !S.get(n.type).noLabel) {
      const a = G.localToWorld(n, nodeLabelAnchor(n));
      const lb = labelBox(n.label);
      const rr = Math.max(lb.w, lb.h) / 2;
      box = G.unionBox(box, { x: a.x - rr, y: a.y - rr, w: rr * 2, h: rr * 2 });
    }
    if (n.type === 'fields') box = G.unionBox(box, G.inflate(G.nodeBBox(n), 18));
  }
  for (const e of doc.edges) {
    const touches = edgeSet && (edgeSet.has(e.id) || (e.from.node && nodeSet.has(e.from.node) && e.to.node && nodeSet.has(e.to.node)));
    if (edgeSet && !touches) continue;
    const g = edgeGeom(e);
    box = G.unionBox(box, G.inflate(G.bboxOf(g.pts), 10));
    for (const lab of e.labels || []) {
      const lp = edgeLabelPoint(g, lab);
      const lb = labelBox(lab);
      box = G.unionBox(box, { x: lp.x - lb.w / 2, y: lp.y - lb.h / 2, w: lb.w, h: lb.h });
    }
    if (e.busWidth) box = G.unionBox(box, G.inflate(G.bboxOf(g.pts), 26));
  }
  for (const g of doc.groups) {
    if (nodeSet && ![...groupNodesDeep(g.id)].some((id) => nodeSet.has(id))) continue;
    const geom = geoms.get(g.id);
    if (!geom) continue;
    box = G.unionBox(box, G.inflate(geom.bbox, (g.strokeWidth || 2)));
    if (g.label && g.label.text) {
      const a = groupLabelAnchor(g, geom);
      const lb = labelBox(g.label);
      const rr = Math.max(lb.w, lb.h) / 2;
      box = G.unionBox(box, { x: a.x - rr, y: a.y - rr, w: rr * 2, h: rr * 2 });
    }
  }
  return box;
}

function zoomFit() {
  const box = contentBBox(false);
  const r = el.canvas.getBoundingClientRect();
  if (!box) {
    view.zoom = 1;
    view.x = r.width / 2;
    view.y = r.height / 2;
  } else {
    const z = clamp(Math.min((r.width - 80) / (box.w || 1), (r.height - 80) / (box.h || 1), 1.5), MIN_ZOOM, MAX_ZOOM);
    view.zoom = z;
    view.x = r.width / 2 - (box.x + box.w / 2) * z;
    view.y = r.height / 2 - (box.y + box.h / 2) * z;
  }
  updateViewTransform();
  render();
  scheduleAutosave();
}

function toWorld(ev) {
  const r = el.canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left - view.x) / view.zoom, y: (ev.clientY - r.top - view.y) / view.zoom };
}

function toScreen(p) {
  const r = el.canvas.getBoundingClientRect();
  const s = el.stage.getBoundingClientRect();
  return { x: p.x * view.zoom + view.x + r.left - s.left, y: p.y * view.zoom + view.y + r.top - s.top };
}

// ---------------------------------------------------------------------------
// Pointer interaction
// ---------------------------------------------------------------------------

/** What an arrow end dropped at p would attach to. */
function endAt(p, opts = {}) {
  const tol = 12 / view.zoom;
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const n = doc.nodes[i];
    if (opts.exclude && opts.exclude === n.id) continue;
    const l = G.worldToLocal(n, p);
    if (l.x < -tol || l.y < -tol || l.x > n.w + tol || l.y > n.h + tol) continue;
    let best = null;
    for (const lp of nodePortsLocal(n)) {
      const d = G.dist(G.localToWorld(n, lp), p);
      if (d <= tol && (!best || d < best.d)) best = { d, id: lp.id };
    }
    if (best) return { node: n.id, port: best.id };
    if (l.x >= 0 && l.y >= 0 && l.x <= n.w && l.y <= n.h && n.type !== 'junction') {
      const b = boundaryLocal(n, l.x / (n.w || 1), l.y / (n.h || 1));
      return { node: n.id, nx: r2(b.x / (n.w || 1)), ny: r2(b.y / (n.h || 1)) };
    }
    if (n.type === 'junction') {
      return { node: n.id, port: nodePortsLocal(n)[0].id };
    }
  }
  return { x: snapV(p.x), y: snapV(p.y) };
}

function previewEdge() {
  if (!drag || drag.mode !== 'edge-draw') return null;
  const to = drag.target || { x: drag.cur.x, y: drag.cur.y };
  const wps = drag.waypoints.slice();
  return {
    id: '__preview', from: drag.from, to,
    style: wps.length ? 'ortho' : drag.style, waypoints: wps, manual: wps.length > 0, curve: { u: 0, v: 0 },
  };
}

function startEdgeDraw(from, p, ev) {
  drag = {
    mode: 'edge-draw', from, start: p, cur: p, waypoints: [], target: null, clickMode: false, moved: false,
    style: newEdgeStyle, portNode: from.node || null, startClient: { x: ev.clientX, y: ev.clientY },
  };
  setSelection([]);
}

function finishEdgeDraw() {
  const d = drag;
  drag = null;
  const to = d.target || { x: snapV(d.cur.x), y: snapV(d.cur.y) };
  const fromPt = resolveEnd(d.from).pt;
  const toPt = resolveEnd(to).pt;
  if (!to.node && !d.waypoints.length && G.dist(fromPt, toPt) < 8) {
    render();
    return;
  }
  if (to.node && to.node === d.from.node && to.port === d.from.port && !d.waypoints.length) {
    render();
    return;
  }
  const e = makeEdge(d.from, to, {
    style: d.waypoints.length ? 'ortho' : d.style,
    waypoints: d.waypoints,
    manual: d.waypoints.length > 0,
  });
  if (e.style === 'curve') e.curve = { u: 0, v: Math.min(60, G.dist(fromPt, toPt) * 0.2) };
  doc.edges.push(e);
  selection = new Set(['e:' + e.id]);
  render();
  renderProps();
  updateToolbar();
  commit('Connect arrow');
}

function addDrawWaypoint(p) {
  const last = drag.waypoints.length ? drag.waypoints[drag.waypoints.length - 1] : resolveEnd(drag.from).pt;
  const q = { x: snapV(p.x), y: snapV(p.y) };
  if (!G.samePoint(q, last)) drag.waypoints.push(q);
}

function onPointerDown(ev) {
  hideMenus();
  if (editing) finishEdit(true);
  el.canvas.focus({ preventScroll: true });
  const p = toWorld(ev);
  const t = ev.target.closest('[data-kind]');
  const kind = t ? t.dataset.kind : null;

  // Click-to-place mode for arrows: each click adds a bend or finishes.
  if (drag && drag.mode === 'edge-draw' && drag.clickMode) {
    drag.cur = p;
    drag.target = endAt(p);
    if (ev.button === 0 && ev.ctrlKey && !drag.target.node) {
      addDrawWaypoint(p);
      renderOverlay();
    } else if (ev.button === 0) {
      finishEdgeDraw();
    } else {
      drag = null;
      renderOverlay();
    }
    ev.preventDefault();
    return;
  }

  el.canvas.setPointerCapture(ev.pointerId);
  const startClient = { x: ev.clientX, y: ev.clientY };

  if (ev.button === 1 || (ev.button === 0 && ev.shiftKey && !kind)) {
    drag = { mode: 'pan', startClient, base: { x: view.x, y: view.y } };
    el.canvas.classList.add('panning');
    ev.preventDefault();
    return;
  }
  if (ev.button === 2) {
    drag = { mode: 'right', start: p, startClient, kind, id: t ? t.dataset.id : null, seg: t ? t.dataset.seg : null };
    return;
  }
  if (ev.button !== 0) return;

  if (kind === 'handle') {
    startHandleDrag(t, p, ev, startClient);
    return;
  }
  if (kind === 'port') {
    startEdgeDraw({ node: t.dataset.id, port: t.dataset.port }, p, ev);
    renderOverlay();
    return;
  }
  if ((kind === 'node' || kind === 'nlabel') && ev.altKey) {
    startEdgeDraw(endAt(p), p, ev);
    renderOverlay();
    return;
  }
  if (kind === 'nlabel' && (selection.has('n:' + t.dataset.id) || selection.has('l:n:' + t.dataset.id))) {
    startLabelDrag({ kind: 'label', owner: 'n', id: t.dataset.id, idx: null }, p, startClient);
    return;
  }
  if (kind === 'elabel') {
    startLabelDrag({ kind: 'label', owner: 'e', id: t.dataset.id, idx: Number(t.dataset.idx) }, p, startClient);
    return;
  }
  if (kind === 'glabel' && (selection.has('g:' + t.dataset.id) || selection.has('l:g:' + t.dataset.id))) {
    startLabelDrag({ kind: 'label', owner: 'g', id: t.dataset.id, idx: null }, p, startClient);
    return;
  }
  if (kind === 'node' || kind === 'nlabel') {
    nodePointerDown(t.dataset.id, ev, p, startClient);
    return;
  }
  if (kind === 'group' || kind === 'glabel') {
    const key = 'g:' + t.dataset.id;
    if (ev.shiftKey) {
      const next = new Set(selection);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelection(next);
    } else if (!selection.has(key)) {
      setSelection([key]);
    }
    beginMove(p, startClient);
    return;
  }
  if (kind === 'edge') {
    edgePointerDown(t, ev, p, startClient);
    return;
  }
  // Empty space: box select.
  if (!ev.shiftKey) setSelection([]);
  drag = { mode: 'marquee', start: p, cur: p, startClient, additive: ev.shiftKey, base: new Set(selection), moved: false };
}

function nodePointerDown(id, ev, p, startClient) {
  const chain = selectionChain(id);
  if (ev.shiftKey) {
    const next = new Set(selection);
    const key = chain.find((k) => next.has(k)) || chain[0];
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection(next);
    if (!next.size) return;
    beginMove(p, startClient);
    return;
  }
  const already = chain.find((k) => selection.has(k));
  if (!already) setSelection([chain[0]]);
  beginMove(p, startClient);
  // A plain click (no drag) on an already-selected group drills one level in.
  if (already && selection.size === 1 && already !== chain[chain.length - 1]) {
    drag.drill = chain[chain.indexOf(already) + 1];
  }
}

function edgePointerDown(t, ev, p, startClient) {
  const id = t.dataset.id;
  const key = 'e:' + id;
  if (ev.shiftKey) {
    const next = new Set(selection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection(next);
    return;
  }
  const e = findEdge(id);
  if (!selection.has(key)) setSelection([key]);
  if (selection.size > 1) {
    beginMove(p, startClient);
    return;
  }
  const g = edgeGeom(e);
  if (g.kind === 'ortho' && t.dataset.seg !== undefined) {
    drag = { mode: 'segment', id, seg: Number(t.dataset.seg), basePts: g.pts, startClient, moved: false };
  } else if (g.kind === 'curve') {
    drag = { mode: 'curve', id, startClient, moved: false };
  } else if (!e.from.node || !e.to.node) {
    beginMove(p, startClient);
  } else {
    drag = { mode: 'none', startClient };
  }
}

function beginMove(p, startClient) {
  const nodeSet = selectedNodesDeep();
  const edgeSet = new Set(selectedOf('edge'));
  const anchor = [...nodeSet].map((id) => G.nodeBBox(findNode(id)))[0] || null;
  drag = { mode: 'move', start: p, startClient, nodeSet, edgeSet, base: captureBase(nodeSet), anchor, moved: false };
}

function startLabelDrag(lp, p, startClient) {
  const key = 'l:' + lp.owner + ':' + lp.id + (lp.idx !== null && lp.idx !== undefined ? ':' + lp.idx : '');
  if (!selection.has(key)) setSelection([key]);
  const lab = labelOf(lp);
  const fr = labelFrame(lp);
  drag = {
    mode: 'label-move', lp, start: p, startClient, moved: false,
    base: { dx: lab.dx || 0, dy: lab.dy || 0, t: lab.t }, grab: { x: p.x - fr.c.x, y: p.y - fr.c.y },
  };
}

function startHandleDrag(t, p, ev, startClient) {
  const h = t.dataset.h;
  const id = t.dataset.id;
  if (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].includes(h)) {
    const n = findNode(id);
    drag = { mode: 'resize', id, handle: h, base: Object.assign({}, n), startClient, moved: false };
  } else if (h === 'rot') {
    const n = findNode(id);
    drag = { mode: 'rotate-node', id, base: captureBase(new Set([id])), startClient, moved: false, start: n.rotation || 0 };
  } else if (h === 'srot') {
    const set = selectedNodesDeep();
    const box = selectionBBox(computeGroupGeoms());
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    drag = {
      mode: 'rotate-sel', nodeSet: set, edgeSet: new Set(selectedOf('edge')), base: captureBase(set), c,
      a0: Math.atan2(p.y - c.y, p.x - c.x), startClient, moved: false,
    };
  } else if (h === 'lrot') {
    const lp = selectedLabel();
    drag = { mode: 'label-rotate', lp, startClient, moved: false };
  } else if (h === 'from' || h === 'to') {
    const e = findEdge(id);
    drag = { mode: 'edge-end', id, which: h, base: deepCopy(e[h]), startClient, moved: false, portNode: null };
  } else if (h === 'curve') {
    drag = { mode: 'curve', id, startClient, moved: false };
  } else if (h === 'seg') {
    const e = findEdge(id);
    drag = { mode: 'segment', id, seg: Number(t.dataset.seg), basePts: edgeGeom(e).pts, startClient, moved: false };
  } else if (h === 'emove') {
    beginMove(p, startClient);
  }
}

function pointerAngle(p, c) {
  return Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
}

function onPointerMove(ev) {
  const p = toWorld(ev);
  if (!drag) {
    const t = ev.target.closest('[data-kind]');
    let hn = null;
    if (t && (t.dataset.kind === 'node' || t.dataset.kind === 'nlabel' || t.dataset.kind === 'port')) hn = t.dataset.id;
    if (hn !== hoverNode) {
      hoverNode = hn;
      renderOverlay();
    }
    return;
  }
  const dist = Math.hypot(ev.clientX - (drag.startClient ? drag.startClient.x : ev.clientX),
    ev.clientY - (drag.startClient ? drag.startClient.y : ev.clientY));
  if (!drag.moved && dist < DRAG_THRESHOLD && drag.mode !== 'edge-draw') return;
  const wasMoved = drag.moved;
  drag.moved = true;

  switch (drag.mode) {
    case 'pan':
      view.x = drag.base.x + ev.clientX - drag.startClient.x;
      view.y = drag.base.y + ev.clientY - drag.startClient.y;
      updateViewTransform();
      break;
    case 'right':
      if (drag.kind === 'node' || drag.kind === 'nlabel' || drag.kind === 'port') {
        const from = endAt(drag.start);
        startEdgeDraw(from, drag.start, ev);
        drag.startClient = null;
        drag.moved = true;
        drag.cur = p;
        renderOverlay();
      }
      break;
    case 'marquee': {
      drag.cur = p;
      const b = G.bboxOf([drag.start, p]);
      const keys = new Set(drag.additive ? drag.base : []);
      const geoms = computeGroupGeoms();
      const inside = new Set(doc.nodes.filter((n) => G.boxContains(b, G.nodeBBox(n))).map((n) => n.id));
      for (const id of inside) {
        const chain = selectionChain(id);
        // Pick the outermost group that is completely inside the box.
        let key = chain[chain.length - 1];
        for (const k of chain) {
          if (k.startsWith('g:') && [...groupNodesDeep(k.slice(2))].every((m) => inside.has(m))) {
            key = k;
            break;
          }
        }
        keys.add(key);
      }
      for (const e of doc.edges) {
        const gm = edgeGeom(e);
        if (gm.pts.every((q) => q.x >= b.x && q.y >= b.y && q.x <= b.x + b.w && q.y <= b.y + b.h)) keys.add('e:' + e.id);
      }
      selection = keys;
      renderOverlay(geoms);
      break;
    }
    case 'move': {
      let dx = p.x - drag.start.x;
      let dy = p.y - drag.start.y;
      if (drag.anchor && snapOn() && !ev.altKey) {
        dx = G.snap(drag.anchor.x + dx, doc.grid.size) - drag.anchor.x;
        dy = G.snap(drag.anchor.y + dy, doc.grid.size) - drag.anchor.y;
      }
      restoreBase(drag.base);
      translateNodes(drag.nodeSet, dx, dy, drag.edgeSet);
      requestRender();
      break;
    }
    case 'resize':
      doResize(p, ev);
      requestRender();
      break;
    case 'rotate-node': {
      const n = findNode(drag.id);
      const c = G.center(n);
      let a = pointerAngle(p, c);
      if (!ev.shiftKey) a = Math.round(a / ROTATE_SNAP) * ROTATE_SNAP;
      restoreBase(drag.base);
      rotateNodes(new Set([drag.id]), c, normAngle(a) - (n.rotation || 0));
      n.rotation = normAngle(a);
      requestRender();
      break;
    }
    case 'rotate-sel': {
      let delta = (Math.atan2(p.y - drag.c.y, p.x - drag.c.x) - drag.a0) * 180 / Math.PI;
      if (!ev.shiftKey) delta = Math.round(delta / ROTATE_SNAP) * ROTATE_SNAP;
      restoreBase(drag.base);
      rotateNodes(drag.nodeSet, drag.c, delta, drag.edgeSet);
      requestRender();
      break;
    }
    case 'label-move':
      doLabelMove(p);
      requestRender();
      break;
    case 'label-rotate': {
      const lab = labelOf(drag.lp);
      const fr = labelFrame(drag.lp);
      let a = pointerAngle(p, fr.c);
      if (!ev.shiftKey) a = Math.round(a / ROTATE_SNAP) * ROTATE_SNAP;
      lab.rotation = normAngle(a - fr.base);
      requestRender();
      break;
    }
    case 'edge-draw': {
      drag.cur = p;
      drag.target = endAt(p);
      drag.portNode = drag.target.node || (drag.from.node && !wasMoved ? drag.from.node : null);
      renderOverlay();
      break;
    }
    case 'edge-end': {
      const e = findEdge(drag.id);
      const other = drag.which === 'from' ? e.to : e.from;
      let target = endAt(p);
      if (target.node && other.node === target.node && other.port && other.port === target.port) target = { x: snapV(p.x), y: snapV(p.y) };
      e[drag.which] = target;
      drag.target = target.node ? target : null;
      drag.portNode = target.node || null;
      requestRender();
      break;
    }
    case 'curve': {
      const e = findEdge(drag.id);
      const g = edgeGeom(e);
      const mid = G.lerp(g.a, g.b, 0.5);
      const c = { x: 2 * p.x - mid.x, y: 2 * p.y - mid.y };
      const len = G.dist(g.a, g.b) || 1;
      const ux = (g.b.x - g.a.x) / len;
      const uy = (g.b.y - g.a.y) / len;
      const dx = c.x - mid.x;
      const dy = c.y - mid.y;
      e.curve = { u: r2(dx * ux + dy * uy), v: r2(-dx * uy + dy * ux) };
      requestRender();
      break;
    }
    case 'segment': {
      const e = findEdge(drag.id);
      const q = { x: snapV(p.x), y: snapV(p.y) };
      const pts = R.moveSegment(drag.basePts, drag.seg, q);
      e.waypoints = pts.slice(1, -1);
      e.manual = true;
      requestRender();
      break;
    }
    default:
      break;
  }
}

function doResize(p, ev) {
  const n = findNode(drag.id);
  const b = drag.base;
  const def = S.get(n.type);
  const lp = G.worldToLocal(b, p);
  const h = drag.handle;
  const hx = h.includes('e') ? 1 : (h.includes('w') ? -1 : 0);
  const hy = h.includes('s') ? 1 : (h.includes('n') ? -1 : 0);
  let px = lp.x;
  let py = lp.y;
  if (!b.rotation && snapOn() && !ev.altKey) {
    px = G.snap(b.x + px, doc.grid.size) - b.x;
    py = G.snap(b.y + py, doc.grid.size) - b.y;
  }
  let x0 = 0;
  let y0 = 0;
  let x1 = b.w;
  let y1 = b.h;
  if (hx === 1) x1 = Math.max(px, MIN_SIZE);
  if (hx === -1) x0 = Math.min(px, b.w - MIN_SIZE);
  if (hy === 1) y1 = Math.max(py, MIN_SIZE);
  if (hy === -1) y0 = Math.min(py, b.h - MIN_SIZE);
  let w = x1 - x0;
  let hh = y1 - y0;
  if (ev.shiftKey || def.lockAspect) {
    const ratio = b.w / b.h;
    if (hx && hy) {
      if (w / ratio > hh) hh = w / ratio;
      else w = hh * ratio;
    } else if (hx) {
      hh = w / ratio;
    } else {
      w = hh * ratio;
    }
    if (hx === -1) x0 = x1 - w;
    else if (hx === 1) x1 = x0 + w;
    else { x0 = b.w / 2 - w / 2; x1 = x0 + w; }
    if (hy === -1) y0 = y1 - hh;
    else if (hy === 1) y1 = y0 + hh;
    else { y0 = b.h / 2 - hh / 2; y1 = y0 + hh; }
  }
  const wc = G.localToWorld(b, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  n.w = r2(w);
  n.h = r2(hh);
  n.x = r2(wc.x - w / 2);
  n.y = r2(wc.y - hh / 2);
}

function doLabelMove(p) {
  const lp = drag.lp;
  const lab = labelOf(lp);
  const target = { x: p.x - drag.grab.x, y: p.y - drag.grab.y };
  if (lp.owner === 'e') {
    const g = edgeGeom(findEdge(lp.id));
    const near = G.nearestOnPolyline(g.pts, target);
    lab.t = r2(near.t);
    const at = G.pointAlong(g.pts, lab.t);
    lab.dx = r2(target.x - at.x);
    lab.dy = r2(target.y - at.y);
    // Snap back onto the line when released close to it.
    if (Math.hypot(lab.dx, lab.dy) < 6 / view.zoom) {
      lab.dx = 0;
      lab.dy = 0;
    }
    return;
  }
  let dx = p.x - drag.start.x;
  let dy = p.y - drag.start.y;
  if (lp.owner === 'n') {
    const n = findNode(lp.id);
    const v = G.rotateVec({ x: dx, y: dy }, -(n.rotation || 0));
    dx = v.x;
    dy = v.y;
  }
  lab.dx = r2(drag.base.dx + dx);
  lab.dy = r2(drag.base.dy + dy);
}

function onPointerUp(ev) {
  if (!drag) return;
  const d = drag;
  try {
    el.canvas.releasePointerCapture(ev.pointerId);
  } catch (err) {
    // capture may already be gone
  }
  el.canvas.classList.remove('panning');
  if (d.mode === 'edge-draw') {
    d.cur = toWorld(ev);
    d.target = endAt(d.cur);
    if (!d.moved && !d.clickMode) {
      // A click on a port starts click-to-place mode.
      d.clickMode = true;
      renderOverlay();
      return;
    }
    if (ev.ctrlKey && !d.target.node) {
      addDrawWaypoint(d.cur);
      d.clickMode = true;
      renderOverlay();
      return;
    }
    if (d.clickMode) return;
    finishEdgeDraw();
    return;
  }
  drag = null;
  switch (d.mode) {
    case 'pan':
      scheduleAutosave();
      break;
    case 'right':
      showContextMenu(ev, d);
      break;
    case 'marquee':
      renderOverlay();
      renderProps();
      updateToolbar();
      break;
    case 'move':
      if (!d.moved && d.drill) setSelection([d.drill]);
      else if (d.moved) commit(d.nodeSet.size + d.edgeSet.size === 1 ? 'Move item' : 'Move ' + (d.nodeSet.size + d.edgeSet.size) + ' items');
      render();
      renderProps();
      break;
    case 'resize':
      if (d.moved) commit('Resize ' + S.get(findNode(d.id).type).name);
      render();
      renderProps();
      break;
    case 'rotate-node':
    case 'rotate-sel':
      if (d.moved) commit('Rotate');
      render();
      renderProps();
      break;
    case 'label-move':
      if (d.moved) commit('Move label');
      render();
      renderProps();
      break;
    case 'label-rotate':
      if (d.moved) commit('Rotate label');
      render();
      renderProps();
      break;
    case 'edge-end':
      if (d.moved) commit(findEdge(d.id)[d.which].node ? 'Connect arrow end' : 'Move arrow end');
      render();
      break;
    case 'curve':
      if (d.moved) commit('Bend arrow');
      render();
      break;
    case 'segment': {
      if (d.moved) {
        const e = findEdge(d.id);
        const g = edgeGeom(e);
        e.waypoints = G.simplifyOrtho(g.pts).slice(1, -1).map((w) => ({ x: r2(w.x), y: r2(w.y) }));
        commit('Move arrow segment');
      }
      render();
      break;
    }
    default:
      renderOverlay();
  }
}

function onDoubleClick(ev) {
  const t = ev.target.closest('[data-kind]');
  const kind = t ? t.dataset.kind : null;
  const p = toWorld(ev);
  if (kind === 'node' || kind === 'nlabel') {
    const n = findNode(t.dataset.id);
    if (S.get(n.type).noLabel) return;
    setSelection(['n:' + n.id]);
    startEdit({ owner: 'n', id: n.id });
  } else if (kind === 'elabel') {
    startEdit({ owner: 'e', id: t.dataset.id, idx: Number(t.dataset.idx) });
  } else if (kind === 'edge') {
    addEdgeLabelAt(t.dataset.id, p);
  } else if (kind === 'group' || kind === 'glabel') {
    setSelection(['g:' + t.dataset.id]);
    startEdit({ owner: 'g', id: t.dataset.id });
  } else if (!kind) {
    const n = makeNode('text', p.x, p.y);
    n.label.text = '';
    doc.nodes.push(n);
    setSelection(['n:' + n.id]);
    render();
    startEdit({ owner: 'n', id: n.id, created: true });
  }
}

function addEdgeLabelAt(eid, p) {
  const e = findEdge(eid);
  const g = edgeGeom(e);
  const near = G.nearestOnPolyline(g.pts, p);
  e.labels = e.labels || [];
  e.labels.push(makeLabel('', r2(near.t)));
  const idx = e.labels.length - 1;
  setSelection(['l:e:' + eid + ':' + idx]);
  render();
  startEdit({ owner: 'e', id: eid, idx, created: true });
}

function onWheel(ev) {
  ev.preventDefault();
  const r = el.canvas.getBoundingClientRect();
  if (ev.shiftKey && !ev.ctrlKey) {
    view.x -= ev.deltaY || ev.deltaX;
    updateViewTransform();
    scheduleAutosave();
    return;
  }
  const factor = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
  zoomAt(factor, ev.clientX - r.left, ev.clientY - r.top);
}

// ---------------------------------------------------------------------------
// Inline label editor
// ---------------------------------------------------------------------------
function startEdit(target) {
  const lp = { kind: 'label', owner: target.owner, id: target.id, idx: target.idx !== undefined ? target.idx : null };
  const lab = labelOf(lp);
  if (!lab) return;
  const fr = labelFrame(lp);
  const sp = toScreen(fr.c);
  editing = Object.assign({ lp, before: lab.text }, target);
  const ed = el.inlineEditor;
  ed.value = lab.text || '';
  ed.classList.remove('hidden');
  const lines = Math.max(1, ed.value.split('\n').length);
  ed.rows = lines;
  ed.style.fontSize = Math.max(11, Math.min(28, (lab.size || 14) * view.zoom)) + 'px';
  const w = Math.max(120, (labelBox(lab).w + 30) * view.zoom);
  ed.style.width = w + 'px';
  ed.style.left = (sp.x - w / 2) + 'px';
  ed.style.top = (sp.y - ed.offsetHeight / 2) + 'px';
  ed.focus();
  ed.select();
}

function finishEdit(save) {
  if (!editing) return;
  const ed = editing;
  editing = null;
  el.inlineEditor.classList.add('hidden');
  const lab = labelOf(ed.lp);
  if (!lab) return;
  if (save) lab.text = el.inlineEditor.value;
  else lab.text = ed.before;
  // Drop empty labels on arrows and empty text shapes created by double-click.
  if (ed.lp.owner === 'e' && !lab.text) {
    findEdge(ed.lp.id).labels.splice(ed.lp.idx, 1);
    selection = new Set(['e:' + ed.lp.id]);
  }
  if (ed.lp.owner === 'n' && ed.created && !lab.text) {
    doc.nodes = doc.nodes.filter((n) => n.id !== ed.lp.id);
    selection = new Set();
  }
  render();
  renderProps();
  updateToolbar();
  if (ed.created && lab.text) commit(ed.lp.owner === 'e' ? 'Add arrow label' : 'Add text');
  else commit('Edit label');
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
function hideMenus() {
  el.contextMenu.classList.add('hidden');
  el.examplesMenu.classList.add('hidden');
  el.alignMenu.classList.add('hidden');
  el.examplesBtn.setAttribute('aria-expanded', 'false');
  el.alignBtn.setAttribute('aria-expanded', 'false');
}

function menuButton(menu, label, fn, disabled) {
  const b = document.createElement('button');
  b.textContent = label;
  b.disabled = !!disabled;
  b.addEventListener('click', () => {
    hideMenus();
    fn();
  });
  menu.appendChild(b);
}

function menuSep(menu) {
  menu.appendChild(document.createElement('hr'));
}

function showContextMenu(ev, d) {
  const m = el.contextMenu;
  m.innerHTML = '';
  const p = d.start;
  const kind = d.kind;
  if (kind === 'edge' || kind === 'elabel') {
    const e = findEdge(d.id);
    setSelection(['e:' + e.id]);
    const g = edgeGeom(e);
    menuButton(m, 'Add label here', () => addEdgeLabelAt(e.id, p));
    if (g.kind === 'ortho') {
      const near = G.nearestOnPolyline(g.pts, p);
      menuButton(m, 'Insert jog here', () => {
        const at = { x: snapV(near.point.x), y: snapV(near.point.y) };
        const pts = R.insertJog(g.pts, near.seg, at, Math.max(20, 2 * doc.grid.size));
        e.waypoints = pts.slice(1, -1).map((w) => ({ x: snapV(w.x), y: snapV(w.y) }));
        e.manual = true;
        render();
        commit('Insert jog');
      });
    }
    menuButton(m, 'Reset route', () => {
      e.waypoints = [];
      e.manual = false;
      e.curve = { u: 0, v: 0 };
      render();
      commit('Reset route');
    }, !(e.manual || (e.curve && (e.curve.u || e.curve.v))));
    menuSep(m);
    for (const [style, name] of [['ortho', '90° segments'], ['straight', 'Straight'], ['curve', 'Curved']]) {
      menuButton(m, (e.style === style ? '✓ ' : '   ') + name, () => setEdgeStyle([e], style));
    }
    menuButton(m, 'Reverse direction', () => {
      [e.from, e.to] = [e.to, e.from];
      e.waypoints.reverse();
      for (const lab of e.labels || []) lab.t = r2(1 - lab.t);
      render();
      commit('Reverse arrow');
    });
    menuSep(m);
    menuButton(m, 'Delete arrow', deleteSelection);
  } else if (kind === 'node' || kind === 'nlabel' || kind === 'group' || kind === 'glabel' || kind === 'port') {
    const key = kind === 'group' || kind === 'glabel' ? 'g:' + d.id : selectionChain(d.id)[0];
    if (!selection.has(key) && !selectionChain(d.id).some((k) => selection.has(k))) setSelection([key]);
    const single = selection.size === 1 ? parseKey([...selection][0]) : null;
    if (single && (single.kind === 'node' || single.kind === 'group')) {
      menuButton(m, 'Edit label', () => startEdit({ owner: single.kind === 'node' ? 'n' : 'g', id: single.id }));
    }
    menuButton(m, 'Rotate 90° clockwise', () => rotateSelection(90));
    menuButton(m, 'Rotate 90° anticlockwise', () => rotateSelection(-90));
    menuSep(m);
    menuButton(m, 'Group', groupSelection);
    menuButton(m, 'Ungroup', ungroupSelection, !selectedOf('group').length);
    menuButton(m, 'Bring to front', () => reorder(true));
    menuButton(m, 'Send to back', () => reorder(false));
    menuSep(m);
    menuButton(m, 'Copy', copySelection);
    menuButton(m, 'Duplicate', () => {
      if (copySelection()) pasteClipboard();
    });
    menuButton(m, 'Delete', deleteSelection);
  } else {
    menuButton(m, 'Paste', pasteClipboard, !clipboard);
    menuButton(m, 'Add text here', () => {
      const n = makeNode('text', p.x, p.y);
      n.label.text = '';
      doc.nodes.push(n);
      setSelection(['n:' + n.id]);
      render();
      startEdit({ owner: 'n', id: n.id, created: true });
    });
    menuButton(m, 'Select all', selectAll);
    menuButton(m, 'Zoom to fit', zoomFit);
  }
  m.classList.remove('hidden');
  const w = m.offsetWidth;
  const h = m.offsetHeight;
  m.style.left = Math.min(ev.clientX, window.innerWidth - w - 8) + 'px';
  m.style.top = Math.min(ev.clientY, window.innerHeight - h - 8) + 'px';
}

function selectAll() {
  const keys = [];
  for (const n of doc.nodes) if (!parentOf(n.id)) keys.push('n:' + n.id);
  for (const g of doc.groups) if (!parentOf(g.id)) keys.push('g:' + g.id);
  for (const e of doc.edges) keys.push('e:' + e.id);
  setSelection(keys);
}

function setEdgeStyle(edges, style) {
  for (const e of edges) {
    if (e.style === style) continue;
    e.style = style;
    e.waypoints = [];
    e.manual = false;
    if (style === 'curve' && !(e.curve && (e.curve.u || e.curve.v))) {
      const g = edgeGeom(e);
      e.curve = { u: 0, v: r2(Math.min(60, G.dist(g.pts[0], g.pts[g.pts.length - 1]) * 0.2)) };
    }
  }
  render();
  renderProps();
  commit('Change arrow style');
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------
function onKeyDown(ev) {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (tag === 'button' && (ev.key === 'Enter' || ev.key === ' ')) return;
  if (!el.exportDialog.classList.contains('hidden') || !el.helpDialog.classList.contains('hidden') ||
    !el.settingsDialog.classList.contains('hidden') || !el.confirmDialog.classList.contains('hidden')) {
    if (ev.key === 'Escape') closeDialogs();
    return;
  }
  const ctrl = ev.ctrlKey || ev.metaKey;
  const key = ev.key;
  if (ctrl && (key === 'z' || key === 'Z')) {
    ev.preventDefault();
    if (ev.shiftKey) redo();
    else undo();
  } else if (ctrl && (key === 'y' || key === 'Y')) {
    ev.preventDefault();
    redo();
  } else if (ctrl && (key === 's' || key === 'S')) {
    ev.preventDefault();
    saveJson();
  } else if (ctrl && (key === 'a' || key === 'A')) {
    ev.preventDefault();
    selectAll();
  } else if (ctrl && (key === 'c' || key === 'C')) {
    if (copySelection()) toast('Copied');
  } else if (ctrl && (key === 'x' || key === 'X')) {
    if (copySelection()) deleteSelection();
  } else if (ctrl && (key === 'v' || key === 'V')) {
    pasteClipboard();
  } else if (ctrl && (key === 'd' || key === 'D')) {
    ev.preventDefault();
    if (copySelection()) pasteClipboard();
  } else if (ctrl && (key === 'g' || key === 'G')) {
    ev.preventDefault();
    if (ev.shiftKey) ungroupSelection();
    else groupSelection();
  } else if (key === 'Delete' || key === 'Backspace') {
    ev.preventDefault();
    deleteSelection();
  } else if (key === 'Escape') {
    if (drag && drag.mode === 'edge-draw') {
      if (drag.clickMode && drag.waypoints.length) {
        finishEdgeDraw();
      } else {
        drag = null;
        renderOverlay();
      }
      return;
    }
    hideMenus();
    const one = selection.size === 1 ? [...selection][0] : null;
    if (one && (one.startsWith('n:') || one.startsWith('g:')) && parentOf(one.slice(2))) {
      setSelection(['g:' + parentOf(one.slice(2)).id]);
    } else if (one && one.startsWith('l:')) {
      const p = parseKey(one);
      setSelection([(p.owner === 'n' ? 'n:' : p.owner === 'g' ? 'g:' : 'e:') + p.id]);
    } else {
      setSelection([]);
    }
  } else if (!ctrl && (key === 'r' || key === 'R')) {
    rotateSelection(ev.shiftKey ? -90 : 90);
  } else if (key === 'F2' || key === 'Enter') {
    const one = selection.size === 1 ? parseKey([...selection][0]) : null;
    if (one && one.kind === 'node') startEdit({ owner: 'n', id: one.id });
    else if (one && one.kind === 'group') startEdit({ owner: 'g', id: one.id });
    else if (one && one.kind === 'label') startEdit({ owner: one.owner, id: one.id, idx: one.idx });
    if (one) ev.preventDefault();
  } else if (key.startsWith('Arrow')) {
    ev.preventDefault();
    const step = ev.shiftKey ? 10 * (doc.grid.size || 10) : (snapOn() ? doc.grid.size : 1);
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
    nudge(dx, dy);
  } else if (key === ']') {
    reorder(true);
  } else if (key === '[') {
    reorder(false);
  } else if (!ctrl && (key === 'f' || key === 'F')) {
    zoomFit();
  } else if (key === '+' || key === '=') {
    zoomCentered(1.2);
  } else if (key === '-' || key === '_') {
    zoomCentered(1 / 1.2);
  }
}

// ---------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function section(title, extra) {
  const sec = mk('div', 'props-section');
  const head = mk('div', 'panel-title');
  head.appendChild(mk('span', '', title));
  if (extra) head.appendChild(extra);
  sec.appendChild(head);
  el.propsPanel.appendChild(sec);
  return sec;
}

function row(sec, label, control) {
  const r = mk('div', 'prop-row');
  const l = mk('label', '', label);
  r.appendChild(l);
  r.appendChild(control);
  sec.appendChild(r);
  return r;
}

function numInput(value, opts, onLive, onCommit) {
  const i = document.createElement('input');
  i.type = 'number';
  i.value = value !== undefined && value !== null ? r2(value) : '';
  if (opts.min !== undefined) i.min = opts.min;
  if (opts.max !== undefined) i.max = opts.max;
  i.step = opts.step || 1;
  i.addEventListener('input', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v)) {
      onLive(opts.min !== undefined || opts.max !== undefined ? clamp(v, opts.min ?? -Infinity, opts.max ?? Infinity) : v);
      requestRender();
    }
  });
  i.addEventListener('change', () => onCommit());
  return i;
}

function textInput(value, onLive, onCommit, multiline) {
  const i = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) i.type = 'text';
  i.value = value || '';
  i.addEventListener('input', () => {
    onLive(i.value);
    requestRender();
  });
  i.addEventListener('change', () => onCommit());
  return i;
}

function selectInput(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    s.appendChild(o);
  }
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function checkInput(value, onChange) {
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = !!value;
  c.addEventListener('change', () => onChange(c.checked));
  const wrap = mk('span');
  wrap.appendChild(c);
  return wrap;
}

function pair(a, b) {
  const p = mk('div', 'prop-pair');
  p.appendChild(a);
  p.appendChild(b);
  return p;
}

function toHex(c) {
  if (/^#[0-9a-f]{6}$/i.test(c || '')) return c;
  return '#888888';
}

/** Swatch row: theme tokens, "none", and a free colour picker. */
function colorControl(value, tokens, allowNone, apply, label) {
  const wrap = mk('div', 'swatches');
  const mark = (v) => {
    for (const b of wrap.querySelectorAll('.swatch')) b.classList.toggle('active', b.dataset.v === v);
  };
  const pick = (v) => {
    apply(v);
    mark(v);
    render();
    commit(label);
  };
  if (allowNone) {
    const b = mk('button', 'swatch swatch-none');
    b.type = 'button';
    b.dataset.v = 'none';
    b.title = 'None (transparent)';
    b.addEventListener('click', () => pick('none'));
    wrap.appendChild(b);
  }
  for (const tok of tokens) {
    const b = mk('button', 'swatch');
    b.type = 'button';
    b.dataset.v = tok;
    b.title = TOKEN_NAMES[tok] || tok;
    b.style.background = colorCss(tok);
    b.addEventListener('click', () => pick(tok));
    wrap.appendChild(b);
  }
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.className = 'swatch-custom';
  custom.title = 'Custom colour';
  custom.value = toHex(value);
  custom.addEventListener('input', () => {
    apply(custom.value);
    mark(custom.value);
    requestRender();
  });
  custom.addEventListener('change', () => commit(label, { coalesce: true }));
  wrap.appendChild(custom);
  mark(value || 'none');
  return wrap;
}

function styleRows(sec, items, opts) {
  const first = items[0];
  const each = (fn) => () => items.forEach(fn);
  if (opts.fill) {
    row(sec, 'Fill', colorControl(first.fill, FILL_TOKENS, true, (v) => items.forEach((i) => { i.fill = v; }), 'Change fill'));
  }
  row(sec, opts.strokeLabel || 'Line', colorControl(first.stroke, STROKE_TOKENS, opts.strokeNone !== false,
    (v) => items.forEach((i) => { i.stroke = v; }), 'Change line colour'));
  row(sec, 'Line width', pair(
    numInput(first.strokeWidth, { min: 0.5, max: 12, step: 0.5 }, (v) => items.forEach((i) => { i.strokeWidth = v; }),
      () => commit('Change line width', { coalesce: true })),
    selectInput([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['long', 'Long dash']], first.dash || 'solid',
      (v) => {
        each((i) => { i.dash = v; })();
        render();
        commit('Change dash');
      })));
}

function labelRows(sec, labels, opts = {}) {
  const lab = labels[0];
  const all = (fn) => labels.forEach(fn);
  if (opts.text !== false) {
    row(sec, 'Label', textInput(lab.text, (v) => all((l) => { l.text = v; }), () => commit('Edit label', { coalesce: true }), true));
  }
  if (opts.positions) {
    row(sec, 'Position', selectInput(opts.positions, lab.pos || opts.positions[0][0], (v) => {
      all((l) => {
        l.pos = v;
        l.dx = 0;
        l.dy = 0;
      });
      render();
      commit('Move label');
    }));
  }
  row(sec, 'Size / angle', pair(
    numInput(lab.size || 14, { min: 6, max: 96 }, (v) => all((l) => { l.size = v; }), () => commit('Change label size', { coalesce: true })),
    numInput(lab.rotation || 0, { min: -360, max: 360, step: ROTATE_SNAP }, (v) => all((l) => { l.rotation = normAngle(v); }),
      () => commit('Rotate label', { coalesce: true }))));
  row(sec, 'Text colour', colorControl(lab.color || 'ink', STROKE_TOKENS, false, (v) => all((l) => { l.color = v; }), 'Change label colour'));
  const flags = mk('div', 'prop-pair');
  const bold = checkInput(lab.bold, (v) => {
    all((l) => { l.bold = v; });
    render();
    commit('Change label style');
  });
  bold.appendChild(document.createTextNode(' Bold'));
  flags.appendChild(bold);
  if (opts.bg) {
    const bg = checkInput(lab.bg, (v) => {
      all((l) => { l.bg = v; });
      render();
      commit('Change label style');
    });
    bg.appendChild(document.createTextNode(' Mask line'));
    flags.appendChild(bg);
  }
  row(sec, 'Style', flags);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}

function setPath(obj, path, v) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = v;
}

function nodeSections(nodes) {
  const n = nodes[0];
  const def = S.get(n.type);
  const sameType = nodes.every((x) => x.type === n.type);
  const sec = section(nodes.length === 1 ? def.name : nodes.length + ' shapes');
  if (nodes.length === 1) {
    row(sec, 'X / Y', pair(
      numInput(n.x, {}, (v) => { n.x = v; }, () => commit('Move item', { coalesce: true })),
      numInput(n.y, {}, (v) => { n.y = v; }, () => commit('Move item', { coalesce: true }))));
    row(sec, 'W / H', pair(
      numInput(n.w, { min: MIN_SIZE }, (v) => { n.w = v; }, () => commit('Resize', { coalesce: true })),
      numInput(n.h, { min: MIN_SIZE }, (v) => { n.h = v; }, () => commit('Resize', { coalesce: true }))));
  }
  row(sec, 'Rotation', numInput(n.rotation || 0, { min: -360, max: 360, step: ROTATE_SNAP },
    (v) => nodes.forEach((x) => { x.rotation = normAngle(v); }), () => commit('Rotate', { coalesce: true })));
  if (sameType && def.ui && def.ui.length) {
    for (const f of def.ui) {
      const cur = getPath(n.props, f.key);
      let ctl;
      if (f.type === 'number') {
        ctl = numInput(cur, { min: f.min, max: f.max }, (v) => nodes.forEach((x) => setPath(x.props, f.key, Math.round(v))),
          () => commit('Change ' + f.label.toLowerCase(), { coalesce: true }));
      } else if (f.type === 'checkbox') {
        ctl = checkInput(cur !== false, (v) => {
          nodes.forEach((x) => setPath(x.props, f.key, v));
          render();
          commit('Change ' + f.label.toLowerCase());
        });
      } else {
        ctl = textInput(cur, (v) => nodes.forEach((x) => setPath(x.props, f.key, v)),
          () => commit('Change ' + f.label.toLowerCase(), { coalesce: true }));
      }
      row(sec, f.label, ctl);
    }
    if (def.hint) sec.appendChild(mk('p', 'prop-hint', def.hint));
  }
  const style = section('Style');
  styleRows(style, nodes, { fill: true });
  if (!def.noLabel) {
    const ls = section('Label');
    labelRows(ls, nodes.map((x) => x.label), { positions: NODE_LABEL_POS });
    ls.appendChild(mk('p', 'prop-hint', 'Double-click the shape to edit in place. Click a selected shape\'s label to drag or rotate it.'));
  }
}

function edgeSections(edges) {
  const e = edges[0];
  const sec = section(edges.length === 1 ? 'Arrow' : edges.length + ' arrows');
  row(sec, 'Route', selectInput([['ortho', '90° segments'], ['straight', 'Straight'], ['curve', 'Curved']], e.style,
    (v) => setEdgeStyle(edges, v)));
  row(sec, 'Ends', pair(
    selectInput(ARROWS, e.arrowStart || 'none', (v) => {
      edges.forEach((x) => { x.arrowStart = v; });
      render();
      commit('Change arrowhead');
    }),
    selectInput(ARROWS, e.arrowEnd || 'none', (v) => {
      edges.forEach((x) => { x.arrowEnd = v; });
      render();
      commit('Change arrowhead');
    })));
  row(sec, 'Bus width', textInput(e.busWidth || '', (v) => edges.forEach((x) => { x.busWidth = v; }),
    () => commit('Change bus width', { coalesce: true })));
  styleRows(sec, edges, { fill: false, strokeNone: false });
  const btns = mk('div', 'prop-buttons');
  const reset = mk('button', 'tool-btn', 'Reset route');
  reset.addEventListener('click', () => {
    edges.forEach((x) => {
      x.waypoints = [];
      x.manual = false;
      x.curve = { u: 0, v: 0 };
    });
    render();
    commit('Reset route');
  });
  btns.appendChild(reset);
  const rev = mk('button', 'tool-btn', 'Reverse');
  rev.addEventListener('click', () => {
    edges.forEach((x) => {
      [x.from, x.to] = [x.to, x.from];
      x.waypoints.reverse();
      for (const lab of x.labels || []) lab.t = r2(1 - lab.t);
    });
    render();
    commit('Reverse arrow');
  });
  btns.appendChild(rev);
  sec.appendChild(btns);
  if (edges.length === 1) {
    const addBtn = mk('button', 'link-btn', '+ Add');
    const ls = section('Labels', addBtn);
    addBtn.addEventListener('click', () => {
      e.labels = e.labels || [];
      e.labels.push(makeLabel('Label', 0.5));
      render();
      renderProps();
      commit('Add arrow label');
    });
    (e.labels || []).forEach((lab, i) => {
      const r = mk('div', 'edge-label-row');
      const txt = document.createElement('input');
      txt.type = 'text';
      txt.value = lab.text;
      txt.addEventListener('input', () => {
        lab.text = txt.value;
        requestRender();
      });
      txt.addEventListener('change', () => commit('Edit label', { coalesce: true }));
      const rot = numInput(lab.rotation || 0, { min: -360, max: 360, step: ROTATE_SNAP }, (v) => { lab.rotation = normAngle(v); },
        () => commit('Rotate label', { coalesce: true }));
      rot.title = 'Rotation (degrees)';
      const del = mk('button', 'link-btn', '✕');
      del.title = 'Remove label';
      del.addEventListener('click', () => {
        e.labels.splice(i, 1);
        render();
        renderProps();
        commit('Delete label');
      });
      r.appendChild(txt);
      r.appendChild(rot);
      r.appendChild(del);
      ls.appendChild(r);
    });
    ls.appendChild(mk('p', 'prop-hint', 'Double-click the arrow to add a label there. Drag a label along the arrow; click it to rotate or restyle it.'));
    if (e.style === 'ortho') {
      sec.appendChild(mk('p', 'prop-hint', 'Drag a segment to slide it. Right-click the arrow to insert a jog. Ctrl+release while drawing places a bend.'));
    }
  }
}

function groupSections(groups) {
  const g = groups[0];
  const sec = section(groups.length === 1 ? 'Group' : groups.length + ' groups');
  row(sec, 'Outline', selectInput([['rect', 'Rectangle'], ['ortho', 'Fitted (90° steps)'], ['hull', 'Fitted (smooth hull)']],
    g.outline || 'rect', (v) => {
      groups.forEach((x) => { x.outline = v; });
      render();
      commit('Change outline shape');
    }));
  row(sec, 'Padding / corner', pair(
    numInput(g.padding, { min: 0, max: 200 }, (v) => groups.forEach((x) => { x.padding = v; }), () => commit('Change padding', { coalesce: true })),
    numInput(g.radius || 0, { min: 0, max: 60 }, (v) => groups.forEach((x) => { x.radius = v; }), () => commit('Change corner radius', { coalesce: true }))));
  styleRows(sec, groups, { fill: true, strokeLabel: 'Outline' });
  const btns = mk('div', 'prop-buttons');
  const ug = mk('button', 'tool-btn', 'Ungroup');
  ug.addEventListener('click', ungroupSelection);
  btns.appendChild(ug);
  sec.appendChild(btns);
  sec.appendChild(mk('p', 'prop-hint', 'Pick "None" for a transparent outline. Click a member again to select it inside the group; Esc goes back up.'));
  const ls = section('Group label');
  labelRows(ls, groups.map((x) => x.label), { positions: GROUP_LABEL_POS, bg: true });
}

function labelSection(lp) {
  const lab = labelOf(lp);
  const owner = lp.owner === 'n' ? 'Shape label' : lp.owner === 'g' ? 'Group label' : 'Arrow label';
  const sec = section(owner);
  labelRows(sec, [lab], { bg: lp.owner !== 'n', positions: lp.owner === 'n' ? NODE_LABEL_POS : lp.owner === 'g' ? GROUP_LABEL_POS : null });
  const btns = mk('div', 'prop-buttons');
  const reset = mk('button', 'tool-btn', 'Reset position');
  reset.addEventListener('click', () => {
    lab.dx = 0;
    lab.dy = 0;
    render();
    commit('Move label');
  });
  btns.appendChild(reset);
  sec.appendChild(btns);
  sec.appendChild(mk('p', 'prop-hint', 'Drag to move. Drag the round handle to rotate in 15° steps (Shift = free); R rotates 90°.'));
}

function canvasSection() {
  const sec = section('Diagram');
  sec.appendChild(mk('p', 'prop-hint', doc.nodes.length + ' shapes, ' + doc.edges.length + ' arrows, ' + doc.groups.length + ' groups.'));
  row(sec, 'Grid size', numInput(doc.grid.size, { min: 2, max: 100 }, (v) => {
    doc.grid.size = Math.round(v);
    updateViewTransform();
  }, () => scheduleAutosave()));
  row(sec, 'Snap to grid', checkInput(doc.grid.snap, (v) => {
    doc.grid.snap = v;
    el.snapToggle.checked = v;
    scheduleAutosave();
  }));
  const tips = section('Getting started');
  for (const t of [
    'Drag shapes from the palette on the left.',
    'Hover a shape to see its port dots; drag from a dot to draw an arrow.',
    'Select shapes and press Ctrl+G to group them with an outline.',
    'Double-click anything to edit its label.',
  ]) tips.appendChild(mk('p', 'prop-hint', '• ' + t));
}

function renderProps() {
  el.propsPanel.innerHTML = '';
  const lsel = selectedLabel();
  if (lsel && labelOf(lsel)) {
    labelSection(lsel);
    return;
  }
  const nodes = selectedOf('node').map(findNode).filter(Boolean);
  const edges = selectedOf('edge').map(findEdge).filter(Boolean);
  const groups = selectedOf('group').map(findGroup).filter(Boolean);
  if (!nodes.length && !edges.length && !groups.length) {
    canvasSection();
    return;
  }
  if (groups.length) groupSections(groups);
  if (nodes.length) nodeSections(nodes);
  if (edges.length) edgeSections(edges);
  const act = section('Arrange');
  const btns = mk('div', 'prop-buttons');
  const add = (label, fn, enabled = true) => {
    const b = mk('button', 'tool-btn', label);
    b.disabled = !enabled;
    b.addEventListener('click', fn);
    btns.appendChild(b);
  };
  add('Group', groupSelection, selectedUnits().length > 0);
  add('Rotate 90°', () => rotateSelection(90), nodes.length + groups.length > 0);
  add('Duplicate', () => {
    if (copySelection()) pasteClipboard();
  });
  add('Delete', deleteSelection);
  act.appendChild(btns);
}

function updateToolbar() {
  const units = selectedUnits();
  const hasNodes = selectedNodesDeep().size > 0;
  el.groupBtn.disabled = units.length === 0;
  el.ungroupBtn.disabled = selectedOf('group').length === 0;
  el.alignBtn.disabled = units.length < 2;
  el.frontBtn.disabled = !hasNodes;
  el.backBtn.disabled = !hasNodes;
  el.rotateBtn.disabled = !hasNodes && !selectedLabel();
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
function thumbMarkup(def) {
  if (def.kind === 'edge') {
    const e = makeEdgeThumb(def);
    return '<svg viewBox="0 0 60 36">' + e + '</svg>';
  }
  const n = { id: 't', type: def.id, x: 0, y: 0, w: def.w, h: def.h, rotation: 0, props: deepCopy(def.props || {}) };
  const p = paintFor({ fill: def.fill || 'paper', stroke: def.stroke === 'none' ? 'none' : (def.stroke || 'ink'), strokeWidth: 2, dash: 'solid' });
  let inner = '';
  try {
    inner = def.draw(n, p);
  } catch (err) {
    inner = '';
  }
  if (!inner && def.label) {
    inner = '<text x="' + def.w / 2 + '" y="' + def.h / 2 + '" text-anchor="middle" dominant-baseline="central" style="fill:var(--fd-ink);font-size:' +
      Math.min(def.h * 0.8, 22) + 'px;font-weight:600">' + esc(def.label) + '</text>';
  }
  if (def.id === 'busslash') {
    inner += '<text x="' + (def.w + 3) + '" y="4" style="fill:var(--fd-ink);font-size:12px" dominant-baseline="central">8</text>';
  }
  const pad = Math.max(def.w, def.h) * 0.08 + 3;
  const top = def.id === 'fields' ? 16 : 0;
  return '<svg viewBox="' + r2(-pad) + ' ' + r2(-pad - top) + ' ' + r2(def.w + pad * 2 + (def.id === 'busslash' ? 12 : 0)) + ' ' +
    r2(def.h + pad * 2 + top) + '" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
}

function makeEdgeThumb(def) {
  const color = 'var(--fd-ink)';
  let s = '<line x1="8" y1="18" x2="52" y2="18" style="stroke:' + color + ';stroke-width:2;stroke-linecap:round"/>';
  if (def.edge.arrowEnd === 'arrow') s += arrowMarkup('arrow', { x: 54, y: 18 }, 0, 2, color);
  if (def.edge.arrowStart === 'arrow') s += arrowMarkup('arrow', { x: 6, y: 18 }, Math.PI, 2, color);
  return s;
}

function buildPalette() {
  const list = el.paletteList;
  list.innerHTML = '';
  const q = el.paletteFilter.value.trim().toLowerCase();
  for (const cat of S.CATEGORIES) {
    const items = S.SHAPES.filter((s) => s.cat === cat.id && (!q || s.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q)));
    if (!items.length) continue;
    const wrap = mk('div', 'palette-cat' + (uiPrefs.collapsed[cat.id] && !q ? ' collapsed' : ''));
    const head = mk('button', 'palette-cat-head');
    head.type = 'button';
    head.appendChild(mk('span', 'palette-caret', '▾'));
    head.appendChild(document.createTextNode(cat.name));
    head.addEventListener('click', () => {
      uiPrefs.collapsed[cat.id] = !uiPrefs.collapsed[cat.id];
      wrap.classList.toggle('collapsed', !!uiPrefs.collapsed[cat.id]);
      saveUiPrefs();
    });
    wrap.appendChild(head);
    const grid = mk('div', 'palette-grid');
    for (const def of items) {
      const tile = mk('div', 'palette-tile');
      tile.draggable = true;
      tile.title = def.name + ' — drag onto the playmat or click to add';
      tile.innerHTML = thumbMarkup(def);
      tile.appendChild(mk('span', '', def.name));
      tile.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('application/x-fdd-shape', def.id);
        ev.dataTransfer.setData('text/plain', def.id);
        ev.dataTransfer.effectAllowed = 'copy';
      });
      tile.addEventListener('click', () => {
        const c = viewCenterWorld();
        const off = (doc.nodes.length % 6) * 20;
        addShape(def.id, { x: c.x + off, y: c.y + off });
      });
      grid.appendChild(tile);
    }
    wrap.appendChild(grid);
    list.appendChild(wrap);
  }
}

// ---------------------------------------------------------------------------
// Files: save, open, examples, export
// ---------------------------------------------------------------------------
function saveJson() {
  const blob = new Blob([IO.toJSON(Object.assign({}, doc, { view }))], { type: 'application/json' });
  downloadBlob(fileBase() + '.json', blob);
  toast('Saved ' + fileBase() + '.json');
}

function loadDoc(data, label) {
  doc = {
    name: data.name || 'Untitled diagram',
    nodes: data.nodes,
    edges: data.edges,
    groups: data.groups,
    nextId: data.nextId,
    grid: data.grid,
  };
  routeCache.clear();
  selection = new Set();
  el.docName.value = doc.name;
  el.snapToggle.checked = !!doc.grid.snap;
  el.gridToggle.checked = doc.grid.show !== false;
  initHistory(label);
  if (data.view) {
    Object.assign(view, data.view);
    updateViewTransform();
    render();
  } else {
    render();
    zoomFit();
  }
  renderProps();
  updateToolbar();
  scheduleAutosave();
}

function openFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = IO.parse(String(reader.result));
      if (!data.name || data.name === 'Untitled diagram') data.name = file.name.replace(/\.json$/i, '');
      data.view = null;
      loadDoc(data, 'Open ' + file.name);
      toast('Opened ' + file.name);
    } catch (err) {
      toast(err.message);
    }
  };
  reader.onerror = () => toast('Could not read ' + file.name);
  reader.readAsText(file);
}

async function openExample(ex) {
  try {
    const res = await fetch('examples/' + ex.file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = IO.parse(await res.text());
    data.view = null;
    loadDoc(data, 'Open example: ' + ex.name);
  } catch (err) {
    toast('Could not load the example (' + err.message + '). Examples need the page to be served over http.');
  }
}

function confirmAction(title, text, okLabel, fn) {
  el.confirmTitle.textContent = title;
  el.confirmText.textContent = text;
  el.confirmOk.textContent = okLabel;
  el.confirmDialog.classList.remove('hidden');
  el.confirmOk.onclick = () => {
    el.confirmDialog.classList.add('hidden');
    fn();
  };
}

function newDiagram() {
  const go = () => {
    const d = blankDoc();
    d.grid = Object.assign({}, doc.grid);
    loadDoc(Object.assign(d, { view: { x: 0, y: 0, zoom: 1 } }), 'New diagram');
    zoomFit();
  };
  if (doc.nodes.length || doc.edges.length) {
    confirmAction('Start a new diagram?', 'The current diagram will be cleared. Save it first if you want to keep it (Undo can also bring it back).', 'New diagram', go);
  } else {
    go();
  }
}

function themeVarGetter(theme) {
  const probe = theme === 'dark' ? el.probeDark : el.probeLight;
  const cs = getComputedStyle(probe);
  return (name) => cs.getPropertyValue('--' + name).trim();
}

function buildExportSvg(opts) {
  const onlySel = opts.selection && selection.size > 0;
  const box = contentBBox(onlySel);
  if (!box) return null;
  const m = 20;
  const vb = { x: Math.floor(box.x - m), y: Math.floor(box.y - m), w: Math.ceil(box.w + 2 * m), h: Math.ceil(box.h + 2 * m) };
  const nodeSet = onlySel ? selectedNodesDeep() : null;
  const edgeSel = onlySel ? new Set(selectedOf('edge')) : null;
  const geoms = computeGroupGeoms();
  let body = '';
  for (const g of groupsByDepth()) {
    if (nodeSet && ![...groupNodesDeep(g.id)].every((id) => nodeSet.has(id))) continue;
    body += groupMarkup(g, geoms.get(g.id), true);
  }
  for (const e of doc.edges) {
    if (edgeSel && !edgeSel.has(e.id) && !(e.from.node && nodeSet.has(e.from.node) && e.to.node && nodeSet.has(e.to.node))) continue;
    body += edgeMarkup(e, true);
  }
  for (const n of doc.nodes) {
    if (nodeSet && !nodeSet.has(n.id)) continue;
    body += nodeMarkup(n, true);
  }
  // Strip the editor-only data attributes and classes.
  body = body.replace(/ (class|data-[a-z]+)="[^"]*"/g, '');
  const getVar = themeVarGetter(opts.theme);
  body = IO.resolveVars(body, getVar);
  const bg = opts.background === 'transparent' ? '' :
    '<rect x="' + vb.x + '" y="' + vb.y + '" width="' + vb.w + '" height="' + vb.h + '" fill="' + getVar('fd-paper') + '"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h + '" width="' + vb.w +
    '" height="' + vb.h + '" font-family="Inter, Arial, Helvetica, sans-serif">' + bg + body + '</svg>';
  return { svg, w: vb.w, h: vb.h };
}

async function runExport() {
  const opts = {
    format: el.exportFormat.value,
    theme: el.exportTheme.value,
    background: el.exportBackground.value,
    scale: Number(el.exportScale.value) || 2,
    selection: el.exportSelection.value === 'selection',
  };
  el.exportDialog.classList.add('hidden');
  const out = buildExportSvg(opts);
  if (!out) {
    toast('Nothing to export yet.');
    return;
  }
  if (opts.format === 'svg') {
    downloadBlob(fileBase() + '.svg', new Blob([out.svg], { type: 'image/svg+xml' }));
    toast('Exported ' + fileBase() + '.svg');
    return;
  }
  try {
    const blob = await IO.svgToPng(out.svg, out.w, out.h, opts.scale, null);
    downloadBlob(fileBase() + '.png', blob);
    toast('Exported ' + fileBase() + '.png');
  } catch (err) {
    toast(err.message);
  }
}

function closeDialogs() {
  for (const d of [el.exportDialog, el.helpDialog, el.settingsDialog, el.confirmDialog]) d.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function cacheElements() {
  const ids = ['canvas', 'stage', 'world', 'layerGroups', 'layerEdges', 'layerNodes', 'layerOverlay', 'gridMinor', 'gridMajor',
    'gridMinorPath', 'gridMajorPath', 'gridMinorRect', 'gridMajorRect', 'zoomBadge', 'emptyHint', 'inlineEditor',
    'propsPanel', 'historyPanel', 'historyList', 'historyBtn', 'historyClose', 'undoBtn', 'redoBtn', 'groupBtn', 'ungroupBtn',
    'alignBtn', 'alignMenu', 'frontBtn', 'backBtn', 'rotateBtn', 'edgeStyleSelect', 'snapToggle', 'zoomInBtn', 'zoomOutBtn',
    'zoomResetBtn', 'zoomFitBtn', 'newBtn', 'openBtn', 'saveBtn', 'exportBtn', 'examplesBtn', 'examplesMenu', 'fileInput',
    'paletteList', 'paletteFilter', 'contextMenu', 'toast', 'exportDialog', 'exportFormat', 'exportTheme', 'exportBackground',
    'exportScale', 'exportSelection', 'exportCancel', 'exportGo', 'confirmDialog', 'confirmTitle', 'confirmText', 'confirmOk',
    'confirmCancel', 'helpDialog', 'helpBtn', 'helpClose', 'settingsDialog', 'settingsBtn', 'closeSettings', 'darkModeToggle',
    'gridToggle', 'docName'];
  for (const id of ids) el[id] = $(id);
  el.probeLight = $('themeProbeLight');
  el.probeDark = $('themeProbeDark');
}

function bindEvents() {
  const c = el.canvas;
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointermove', onPointerMove);
  c.addEventListener('pointerup', onPointerUp);
  c.addEventListener('pointercancel', onPointerUp);
  c.addEventListener('dblclick', onDoubleClick);
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('contextmenu', (ev) => ev.preventDefault());
  c.addEventListener('pointerleave', () => {
    if (!drag && hoverNode) {
      hoverNode = null;
      renderOverlay();
    }
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('.popup-menu') && !ev.target.closest('.menu-wrap')) hideMenus();
  });
  window.addEventListener('resize', () => renderOverlay());

  el.stage.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer.types.includes('application/x-fdd-shape')) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    }
  });
  el.stage.addEventListener('drop', (ev) => {
    const id = ev.dataTransfer.getData('application/x-fdd-shape');
    if (!id) return;
    ev.preventDefault();
    addShape(id, toWorld(ev));
  });

  el.inlineEditor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      finishEdit(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      finishEdit(false);
    }
    ev.stopPropagation();
  });
  el.inlineEditor.addEventListener('input', () => {
    el.inlineEditor.rows = Math.max(1, el.inlineEditor.value.split('\n').length);
  });
  el.inlineEditor.addEventListener('blur', () => finishEdit(true));

  el.undoBtn.addEventListener('click', undo);
  el.redoBtn.addEventListener('click', redo);
  el.historyBtn.addEventListener('click', () => toggleHistory());
  el.historyClose.addEventListener('click', () => toggleHistory(false));
  el.groupBtn.addEventListener('click', groupSelection);
  el.ungroupBtn.addEventListener('click', ungroupSelection);
  el.frontBtn.addEventListener('click', () => reorder(true));
  el.backBtn.addEventListener('click', () => reorder(false));
  el.rotateBtn.addEventListener('click', () => rotateSelection(90));
  el.alignBtn.addEventListener('click', () => {
    const open = el.alignMenu.classList.contains('hidden');
    hideMenus();
    el.alignMenu.classList.toggle('hidden', !open);
    el.alignBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  for (const b of el.alignMenu.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      hideMenus();
      alignSelection(b.dataset.align);
    });
  }
  el.edgeStyleSelect.value = newEdgeStyle;
  el.edgeStyleSelect.addEventListener('change', () => {
    newEdgeStyle = el.edgeStyleSelect.value;
    uiPrefs.edgeStyle = newEdgeStyle;
    saveUiPrefs();
  });
  el.snapToggle.addEventListener('change', () => {
    doc.grid.snap = el.snapToggle.checked;
    scheduleAutosave();
    if (!selection.size) renderProps();
  });
  el.zoomInBtn.addEventListener('click', () => zoomCentered(1.2));
  el.zoomOutBtn.addEventListener('click', () => zoomCentered(1 / 1.2));
  el.zoomResetBtn.addEventListener('click', () => {
    const r = el.canvas.getBoundingClientRect();
    zoomAt(1 / view.zoom, r.width / 2, r.height / 2);
  });
  el.zoomFitBtn.addEventListener('click', zoomFit);

  el.newBtn.addEventListener('click', newDiagram);
  el.openBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    const f = el.fileInput.files[0];
    if (f) openFile(f);
    el.fileInput.value = '';
  });
  el.saveBtn.addEventListener('click', saveJson);
  el.exportBtn.addEventListener('click', () => {
    el.exportSelection.disabled = selection.size === 0;
    if (!selection.size) el.exportSelection.value = 'all';
    el.exportTheme.value = document.body.classList.contains('dark') ? el.exportTheme.value : 'light';
    el.exportDialog.classList.remove('hidden');
  });
  el.exportCancel.addEventListener('click', () => el.exportDialog.classList.add('hidden'));
  el.exportGo.addEventListener('click', runExport);
  el.exportFormat.addEventListener('change', () => {
    el.exportScale.disabled = el.exportFormat.value !== 'png';
  });

  for (const ex of EXAMPLES) {
    const b = mk('button');
    b.appendChild(document.createTextNode(ex.name));
    b.appendChild(mk('span', 'menu-sub', ex.sub));
    b.addEventListener('click', () => {
      hideMenus();
      const go = () => openExample(ex);
      if (doc.nodes.length || doc.edges.length) {
        confirmAction('Open the example?', 'The current diagram will be replaced. Undo can bring it back.', 'Open example', go);
      } else {
        go();
      }
    });
    el.examplesMenu.appendChild(b);
  }
  el.examplesBtn.addEventListener('click', () => {
    const open = el.examplesMenu.classList.contains('hidden');
    hideMenus();
    el.examplesMenu.classList.toggle('hidden', !open);
    el.examplesBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  el.docName.addEventListener('change', () => {
    doc.name = el.docName.value.trim() || 'Untitled diagram';
    el.docName.value = doc.name;
    commit('Rename diagram');
  });
  el.docName.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') el.docName.blur();
  });

  el.paletteFilter.addEventListener('input', buildPalette);

  el.helpBtn.addEventListener('click', () => el.helpDialog.classList.remove('hidden'));
  el.helpClose.addEventListener('click', () => el.helpDialog.classList.add('hidden'));
  el.settingsBtn.addEventListener('click', () => el.settingsDialog.classList.remove('hidden'));
  el.closeSettings.addEventListener('click', () => el.settingsDialog.classList.add('hidden'));
  el.confirmCancel.addEventListener('click', () => el.confirmDialog.classList.add('hidden'));
  for (const d of [el.exportDialog, el.helpDialog, el.settingsDialog, el.confirmDialog]) {
    d.addEventListener('click', (ev) => {
      if (ev.target === d) d.classList.add('hidden');
    });
  }
  el.darkModeToggle.addEventListener('change', () => {
    const theme = el.darkModeToggle.checked ? 'dark' : 'light';
    applyTheme(theme);
    setCookie(THEME_COOKIE, theme, 365);
    buildPalette();
  });
  el.gridToggle.addEventListener('change', () => {
    doc.grid.show = el.gridToggle.checked;
    updateViewTransform();
    scheduleAutosave();
  });
}

function restoreAutosave() {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    return IO.parse(text);
  } catch (err) {
    return null;
  }
}

function init() {
  initTheme();
  cacheElements();
  loadUiPrefs();
  newEdgeStyle = ['ortho', 'straight', 'curve'].includes(uiPrefs.edgeStyle) ? uiPrefs.edgeStyle : 'ortho';
  bindEvents();
  buildPalette();
  if (uiPrefs.history) toggleHistory(true);
  const saved = restoreAutosave();
  if (saved) {
    loadDoc(saved, 'Restore autosaved diagram');
  } else {
    loadDoc(Object.assign(blankDoc(), { view: null }), 'New diagram');
  }
}

document.addEventListener('DOMContentLoaded', init);
