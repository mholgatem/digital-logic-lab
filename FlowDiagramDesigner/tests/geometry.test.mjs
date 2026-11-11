// Run with: node --test FlowDiagramDesigner/tests/geometry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const ctx = {};
vm.createContext(ctx);
for (const f of ['geometry.js', 'routing.js', 'shapes.js', 'serialize.js']) {
  vm.runInContext(readFileSync(path.join(here, '..', 'lib', f), 'utf8'), ctx, { filename: f });
}
const { geom: G, routing: R, shapes: S, io: IO } = ctx.FlowDiagram;
// Values created inside the vm context have foreign prototypes; compare as plain data.
const plain = (v) => JSON.parse(JSON.stringify(v));

const isOrtho = (pts) => pts.every((p, i) => i === 0 ||
  Math.abs(p.x - pts[i - 1].x) < 0.01 || Math.abs(p.y - pts[i - 1].y) < 0.01);

function crossesBox(pts, b) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    for (let k = 1; k < 20; k++) {
      if (G.strictlyInside(G.lerp(a, c, k / 20), b)) return true;
    }
  }
  return false;
}

test('rotate and local/world round trip', () => {
  const n = { x: 10, y: 20, w: 100, h: 50, rotation: 90 };
  const p = G.localToWorld(n, { x: 0, y: 0 });
  assert.ok(Math.abs(p.x - 85) < 1e-9 && Math.abs(p.y - (-5)) < 1e-9);
  const back = G.worldToLocal(n, p);
  assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.y) < 1e-9);
  const box = G.nodeBBox(n);
  assert.deepEqual([Math.round(box.w), Math.round(box.h)], [50, 100]);
});

test('convex hull of a square with an interior point', () => {
  const hull = G.convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]);
  assert.equal(hull.length, 4);
});

test('padded hull grows by the padding', () => {
  const hull = G.paddedHull([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }], 10);
  const b = G.bboxOf(hull);
  assert.ok(Math.abs(b.x + 10) < 0.01 && Math.abs(b.w - 120) < 0.01);
  assert.ok(Math.abs(b.h - 70) < 0.5);
});

test('ortho outline of an L arrangement is a 6-vertex stepped polygon', () => {
  const poly = G.orthoOutline([{ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 40, w: 40, h: 60 }]);
  assert.equal(poly.length, 6);
  assert.ok(isOrtho(poly.concat([poly[0]])));
});

test('ortho outline bridges diagonal boxes instead of using the bounding box', () => {
  const poly = G.orthoOutline([{ x: 0, y: 0, w: 50, h: 50 }, { x: 200, y: 200, w: 50, h: 50 }], 20);
  assert.ok(poly.length > 4, 'expected a staircase, got ' + poly.length + ' vertices');
  assert.ok(isOrtho(poly.concat([poly[0]])));
  const b = G.bboxOf(poly);
  assert.deepEqual([b.x, b.y, b.w, b.h], [0, 0, 250, 250]);
});

test('simplifyOrtho removes duplicates and collinear points', () => {
  const out = G.simplifyOrtho([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  assert.deepEqual(plain(out), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
});

test('autoRoute is axis-aligned and avoids an obstacle in the way', () => {
  const start = { pt: { x: 0, y: 100 }, dir: { x: 1, y: 0 }, stub: 20 };
  const end = { pt: { x: 400, y: 100 }, dir: { x: -1, y: 0 }, stub: 20 };
  const wall = { x: 150, y: 40, w: 100, h: 120 };
  const pts = R.autoRoute(start, end, [wall]);
  assert.ok(isOrtho(pts));
  assert.deepEqual(plain(pts[0]), start.pt);
  assert.deepEqual(plain(pts[pts.length - 1]), end.pt);
  assert.ok(!crossesBox(pts, wall), 'route crosses the obstacle: ' + JSON.stringify(pts));
});

test('autoRoute leaves and enters ports along their directions', () => {
  const start = { pt: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, stub: 20 };
  const end = { pt: { x: 200, y: 200 }, dir: { x: -1, y: 0 }, stub: 20 };
  const pts = R.autoRoute(start, end, []);
  assert.ok(isOrtho(pts));
  assert.equal(pts[1].x, 0, 'first segment should go down');
  assert.equal(pts[pts.length - 2].y, 200, 'last segment should be horizontal');
});

test('manualRoute inserts elbows to keep 90° segments', () => {
  const pts = R.manualRoute({ pt: { x: 0, y: 0 }, dir: { x: 1, y: 0 } }, { pt: { x: 100, y: 100 }, dir: { x: -1, y: 0 } },
    [{ x: 50, y: 50 }]);
  assert.ok(isOrtho(pts));
});

test('moveSegment on an end segment adds a jog and keeps the endpoint', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const out = R.moveSegment(pts, 0, { x: 50, y: 30 });
  assert.deepEqual(plain(out[0]), { x: 0, y: 0 });
  assert.ok(isOrtho(out));
  assert.equal(out[1].y, 30);
});

test('insertJog keeps the route orthogonal', () => {
  const pts = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
  const out = R.insertJog(pts, 0, { x: 100, y: 0 }, 20);
  assert.equal(out.length, 6);
  assert.ok(isOrtho(out));
});

test('every shape draws and reports ports with directions', () => {
  for (const def of S.SHAPES) {
    if (def.kind === 'edge') continue;
    const n = { id: 't', type: def.id, x: 0, y: 0, w: def.w, h: def.h, rotation: 0, props: JSON.parse(JSON.stringify(def.props || {})) };
    const p = { fill: 'none', stroke: '#000', sw: 2, dash: '', ink: '#000', pin: '#000' };
    assert.equal(typeof def.draw(n, p), 'string', def.id);
    for (const port of def.ports(n)) {
      assert.ok(port.id && port.dir && (port.dir.x || port.dir.y), def.id + ' port ' + port.id);
    }
  }
});

test('pin syntax parses clock, bubble and overline markers', () => {
  const pins = S.parsePins('D, >Clk, !~CLR, _');
  assert.equal(pins[1].clock, true);
  assert.equal(pins[2].invert, true);
  assert.equal(pins[2].over, true);
  assert.equal(pins[2].name, 'CLR');
  assert.equal(pins[3].name, '');
});

test('diagram JSON round-trips and rejects foreign files', () => {
  const doc = {
    name: 'T', nextId: 5, grid: { size: 10, snap: true, show: true }, view: { x: 1, y: 2, zoom: 1 },
    nodes: [{ id: 'n1', type: 'rect', x: 1, y: 2, w: 30, h: 40, rotation: 0, props: {}, label: { text: 'A' } }],
    edges: [{ id: 'e2', from: { node: 'n1', port: 'e' }, to: { x: 100, y: 100 }, style: 'ortho', waypoints: [], labels: [] },
      { id: 'e3', from: { node: 'missing', port: 'e' }, to: { x: 0, y: 0 } }],
    groups: [{ id: 'g4', members: ['n1'], label: { text: 'G' } }],
  };
  const back = IO.parse(IO.toJSON(doc));
  assert.equal(back.nodes.length, 1);
  assert.equal(back.edges.length, 1, 'edge to a missing node is dropped');
  assert.equal(back.groups[0].members[0], 'n1');
  assert.equal(back.nextId, 5);
  assert.throws(() => IO.parse('{"app":"something-else","nodes":[]}'));
  assert.throws(() => IO.parse('not json'));
});

test('bundled examples parse', () => {
  for (const f of ['simple-cpu-datapath.json', 'logic-gates.json']) {
    const d = IO.parse(readFileSync(path.join(here, '..', 'examples', f), 'utf8'));
    assert.ok(d.nodes.length > 0 && d.edges.length > 0, f);
  }
});
