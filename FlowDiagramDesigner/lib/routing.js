// ---------------------------------------------------------------------------
// Orthogonal (90°) arrow routing for the Flow Diagram Designer. Pure
// functions over points and boxes; depends only on FlowDiagram.geom.
//
// An endpoint is { pt: {x, y}, dir: {x, y} | null, stub: number }:
//   dir  - unit axis vector pointing *out of* the shape (null = free end)
//   stub - how far the route must travel along dir before it may turn
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const FD = root.FlowDiagram = root.FlowDiagram || {};
  const G = FD.geom;

  const CLEARANCE = 10;
  const BEND_COST = 40;
  const DIRS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

  function isHorizontal(d) {
    return Math.abs(d.x) > Math.abs(d.y);
  }

  /** Direction for a free end: the dominant axis pointing at the other end. */
  function freeDir(from, to) {
    return G.axisDir({ x: to.x - from.x, y: to.y - from.y }) || { x: 1, y: 0 };
  }

  /**
   * Inserts elbows so every segment is horizontal or vertical. sDir / eDir
   * (outward directions at the two ends) decide which way the first and last
   * elbows bend so the route leaves and enters ports straight.
   */
  function orthogonalize(pts, sDir, eDir) {
    if (pts.length < 2) return pts.slice();
    const out = [{ x: pts[0].x, y: pts[0].y }];
    const n = pts.length;
    for (let k = 1; k < n; k++) {
      const a = out[out.length - 1];
      const b = pts[k];
      if (!G.aligned(a, b)) {
        let elbow;
        if (k === 1 && sDir) {
          elbow = isHorizontal(sDir) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
        } else if (k === n - 1 && eDir) {
          elbow = isHorizontal(eDir) ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
        } else {
          const prev = out.length >= 2 ? out[out.length - 2] : null;
          const prevHoriz = prev ? Math.abs(prev.y - a.y) < G.EPS : true;
          elbow = prevHoriz ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
        }
        out.push(elbow);
      }
      out.push({ x: b.x, y: b.y });
    }
    return G.simplifyOrtho(out);
  }

  function stubPoint(end) {
    return { x: end.pt.x + end.dir.x * end.stub, y: end.pt.y + end.dir.y * end.stub };
  }

  /** Simple L/Z route used when the search fails. */
  function fallbackRoute(s, e) {
    const s1 = stubPoint(s);
    const e1 = stubPoint(e);
    const pts = [s.pt, s1];
    if (!G.aligned(s1, e1)) {
      if (isHorizontal(s.dir) === isHorizontal(e.dir)) {
        if (isHorizontal(s.dir)) {
          const mx = (s1.x + e1.x) / 2;
          pts.push({ x: mx, y: s1.y }, { x: mx, y: e1.y });
        } else {
          const my = (s1.y + e1.y) / 2;
          pts.push({ x: s1.x, y: my }, { x: e1.x, y: my });
        }
      } else if (isHorizontal(s.dir)) {
        pts.push({ x: e1.x, y: s1.y });
      } else {
        pts.push({ x: s1.x, y: e1.y });
      }
    }
    pts.push(e1, e.pt);
    return orthogonalize(pts, s.dir, e.dir);
  }

  // Minimal binary heap keyed on .f
  function Heap() {
    this.a = [];
  }
  Heap.prototype.push = function (v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  };

  /**
   * Obstacle-aware Manhattan route between two endpoints. `obstacles` are
   * boxes the route should avoid (inflated by CLEARANCE internally). Uses A*
   * on the sparse grid formed by the stub points and the obstacle edges, with
   * a penalty per bend so routes stay simple.
   */
  function autoRoute(start, end, obstacles = []) {
    const s = Object.assign({ stub: 0 }, start);
    const e = Object.assign({ stub: 0 }, end);
    if (!s.dir) s.dir = freeDir(s.pt, e.pt);
    if (!e.dir) e.dir = freeDir(e.pt, s.pt);
    const s1 = stubPoint(s);
    const e1 = stubPoint(e);
    if (G.samePoint(s.pt, e.pt)) return [s.pt, e.pt];

    const obs = obstacles.map((b) => G.inflate(b, CLEARANCE))
      .filter((b) => !G.strictlyInside(s1, b) && !G.strictlyInside(e1, b));
    const blocked = (p) => obs.some((b) => G.strictlyInside(p, b));

    const uniq = (arr) => Array.from(new Set(arr.map((v) => Math.round(v * 2) / 2)))
      .sort((a, b) => a - b);
    const xsRaw = [s1.x, e1.x, (s1.x + e1.x) / 2];
    const ysRaw = [s1.y, e1.y, (s1.y + e1.y) / 2];
    for (const b of obs) {
      xsRaw.push(b.x, b.x + b.w);
      ysRaw.push(b.y, b.y + b.h);
    }
    const xs = uniq(xsRaw);
    const ys = uniq(ysRaw);
    const nx = xs.length;
    const ny = ys.length;
    const ix = (v) => xs.indexOf(Math.round(v * 2) / 2);
    const iy = (v) => ys.indexOf(Math.round(v * 2) / 2);
    const si = ix(s1.x);
    const sj = iy(s1.y);
    const gi = ix(e1.x);
    const gj = iy(e1.y);
    if (si < 0 || sj < 0 || gi < 0 || gj < 0) return fallbackRoute(s, e);

    const dirIndex = (d) => DIRS.findIndex((v) => v.x === d.x && v.y === d.y);
    const startDir = dirIndex(G.axisDir(s.dir));
    const goalDir = dirIndex(G.axisDir({ x: -e.dir.x, y: -e.dir.y }));
    const key = (i, j, d) => (j * nx + i) * 4 + d;
    const best = new Map();
    const prev = new Map();
    const h = (i, j) => Math.abs(xs[i] - xs[gi]) + Math.abs(ys[j] - ys[gj]);
    const heap = new Heap();
    const k0 = key(si, sj, startDir);
    best.set(k0, 0);
    heap.push({ i: si, j: sj, d: startDir, g: 0, f: h(si, sj) });
    let found = null;
    let guard = 0;
    while (heap.a.length && guard++ < 60000) {
      const cur = heap.pop();
      const ck = key(cur.i, cur.j, cur.d);
      if (cur.g > (best.get(ck) ?? Infinity)) continue;
      if (cur.i === gi && cur.j === gj) {
        const total = cur.g + (cur.d === goalDir || !e.stub ? 0 : BEND_COST);
        if (!found || total < found.total) found = { node: cur, total };
        continue;
      }
      if (found && cur.f >= found.total) break;
      for (let d = 0; d < 4; d++) {
        if (d === (cur.d + 2) % 4) continue; // no U-turns
        const ni = cur.i + DIRS[d].x;
        const nj = cur.j + DIRS[d].y;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const a = { x: xs[cur.i], y: ys[cur.j] };
        const b = { x: xs[ni], y: ys[nj] };
        if (blocked(b) || blocked(G.lerp(a, b, 0.5))) continue;
        const g = cur.g + G.dist(a, b) + (d === cur.d ? 0 : BEND_COST);
        const nk = key(ni, nj, d);
        if (g < (best.get(nk) ?? Infinity)) {
          best.set(nk, g);
          prev.set(nk, ck);
          heap.push({ i: ni, j: nj, d, g, f: g + h(ni, nj) });
        }
      }
    }
    if (!found) return fallbackRoute(s, e);
    const pts = [];
    let k = key(found.node.i, found.node.j, found.node.d);
    while (k !== undefined) {
      const cell = Math.floor(k / 4);
      pts.push({ x: xs[cell % nx], y: ys[Math.floor(cell / nx)] });
      k = prev.get(k);
    }
    pts.reverse();
    return G.simplifyOrtho([s.pt, ...pts, e.pt]);
  }

  /**
   * Full point list for a manually shaped route: endpoints plus stored
   * waypoints, with elbows inserted wherever the segments aren't 90°.
   */
  function manualRoute(start, end, waypoints) {
    const sDir = start.dir || freeDir(start.pt, waypoints[0] || end.pt);
    const eDir = end.dir || freeDir(end.pt, waypoints[waypoints.length - 1] || start.pt);
    return orthogonalize([start.pt, ...waypoints, end.pt], sDir, eDir);
  }

  /**
   * Slides one segment of a route perpendicular to itself. When the segment
   * touches an endpoint, a short stub is inserted first so the endpoint stays
   * put and the route jogs instead. Returns the new full point list.
   */
  function moveSegment(pts, seg, to) {
    let p = pts.map((q) => ({ x: q.x, y: q.y }));
    let i = seg;
    if (i === 0) {
      p.splice(1, 0, { x: p[0].x, y: p[0].y });
      i = 1;
    }
    if (i + 1 === p.length - 1) {
      const last = p[p.length - 1];
      p.splice(p.length - 1, 0, { x: last.x, y: last.y });
    }
    const a = p[i];
    const b = p[i + 1];
    if (Math.abs(a.y - b.y) < G.EPS) {
      a.y = to.y;
      b.y = to.y;
    } else {
      a.x = to.x;
      b.x = to.x;
    }
    return p;
  }

  /** Splits segment `seg` around point m with a small rectangular bump. */
  function insertJog(pts, seg, m, size = 20) {
    const p = pts.map((q) => ({ x: q.x, y: q.y }));
    const a = p[seg];
    const b = p[seg + 1];
    const len = G.dist(a, b);
    const half = Math.max(5, Math.min(len / 4, 40));
    const margin = Math.min(10, len / 6);
    const horiz = Math.abs(a.y - b.y) < G.EPS;
    const sign = horiz ? Math.sign(b.x - a.x) || 1 : Math.sign(b.y - a.y) || 1;
    // Keep the bump inside the segment, clear of both ends.
    const fit = (v, p, q) => Math.max(Math.min(v, Math.max(p, q) - margin), Math.min(p, q) + margin);
    let bump;
    if (horiz) {
      const c = fit(m.x, a.x + half * sign, b.x - half * sign);
      const x0 = fit(c - half * sign, a.x, b.x);
      const x1 = fit(c + half * sign, a.x, b.x);
      bump = [{ x: x0, y: a.y }, { x: x0, y: a.y - size }, { x: x1, y: a.y - size }, { x: x1, y: a.y }];
    } else {
      const c = fit(m.y, a.y + half * sign, b.y - half * sign);
      const y0 = fit(c - half * sign, a.y, b.y);
      const y1 = fit(c + half * sign, a.y, b.y);
      bump = [{ x: a.x, y: y0 }, { x: a.x + size, y: y0 }, { x: a.x + size, y: y1 }, { x: a.x, y: y1 }];
    }
    p.splice(seg + 1, 0, ...bump);
    return p;
  }

  FD.routing = {
    CLEARANCE, freeDir, orthogonalize, autoRoute, manualRoute, fallbackRoute,
    moveSegment, insertJog, isHorizontal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
