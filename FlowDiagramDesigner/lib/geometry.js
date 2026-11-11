// ---------------------------------------------------------------------------
// Pure geometry helpers for the Flow Diagram Designer. No DOM access, so the
// same file runs in the browser and under `node --test`.
//
// Conventions: a node is { x, y, w, h, rotation } where (x, y) is the top-left
// corner of the *unrotated* box and rotation (degrees, clockwise on screen) is
// about the box centre. Boxes are { x, y, w, h }.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const FD = root.FlowDiagram = root.FlowDiagram || {};
  const EPS = 0.5;

  function rotate(p, c, deg) {
    if (!deg) return { x: p.x, y: p.y };
    const r = deg * Math.PI / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  }

  function rotateVec(v, deg) {
    return rotate(v, { x: 0, y: 0 }, deg);
  }

  /** Snaps a direction vector to the nearest of the four axis directions. */
  function axisDir(v) {
    if (!v) return null;
    if (Math.abs(v.x) >= Math.abs(v.y)) return { x: v.x >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: v.y >= 0 ? 1 : -1 };
  }

  function center(n) {
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
  }

  function localToWorld(n, p) {
    return rotate({ x: n.x + p.x, y: n.y + p.y }, center(n), n.rotation || 0);
  }

  function worldToLocal(n, p) {
    const q = rotate(p, center(n), -(n.rotation || 0));
    return { x: q.x - n.x, y: q.y - n.y };
  }

  function corners(n) {
    return [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]]
      .map(([x, y]) => localToWorld(n, { x, y }));
  }

  function bboxOf(points) {
    if (!points.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function nodeBBox(n) {
    return bboxOf(corners(n));
  }

  function unionBox(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x, y,
      w: Math.max(a.x + a.w, b.x + b.w) - x,
      h: Math.max(a.y + a.h, b.y + b.h) - y,
    };
  }

  function inflate(b, d) {
    return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
  }

  function boxesIntersect(a, b) {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  }

  function boxContains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
  }

  /** Strict interior test (points on the edge are outside). */
  function strictlyInside(p, b) {
    return p.x > b.x + 0.01 && p.x < b.x + b.w - 0.01 && p.y > b.y + 0.01 && p.y < b.y + b.h - 0.01;
  }

  function snap(v, g) {
    return g > 0 ? Math.round(v / g) * g : v;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Closest point on segment ab to p: { point, t, dist }. */
  function projectOnSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    return { point, t, dist: dist(p, point) };
  }

  // ------------------------------------------------------------- Polylines

  function polylineLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
    return len;
  }

  /** Point at fraction t (0..1) of the polyline's length, with its angle. */
  function pointAlong(pts, t) {
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
    const total = polylineLength(pts);
    let want = Math.max(0, Math.min(1, t)) * total;
    for (let i = 1; i < pts.length; i++) {
      const seg = dist(pts[i - 1], pts[i]);
      if (want <= seg || i === pts.length - 1) {
        const f = seg ? Math.min(1, want / seg) : 0;
        const p = lerp(pts[i - 1], pts[i], f);
        const angle = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        return { x: p.x, y: p.y, angle };
      }
      want -= seg;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  /** Nearest point on a polyline: { point, t (0..1 by length), seg, dist }. */
  function nearestOnPolyline(pts, p) {
    const total = polylineLength(pts) || 1;
    let best = null;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const pr = projectOnSegment(p, pts[i - 1], pts[i]);
      const seg = dist(pts[i - 1], pts[i]);
      if (!best || pr.dist < best.dist) {
        best = { point: pr.point, t: (acc + pr.t * seg) / total, seg: i - 1, dist: pr.dist };
      }
      acc += seg;
    }
    return best || { point: pts[0], t: 0, seg: 0, dist: dist(p, pts[0]) };
  }

  function quadPoint(a, c, b, t) {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    };
  }

  function quadSamples(a, c, b, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(quadPoint(a, c, b, i / n));
    return out;
  }

  function aligned(a, b) {
    return Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS;
  }

  function samePoint(a, b) {
    return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
  }

  /**
   * Removes consecutive duplicate points and middle points that sit on a
   * straight horizontal/vertical run. The first and last points are kept.
   */
  function simplifyOrtho(pts) {
    const out = [];
    for (const p of pts) {
      if (out.length && samePoint(out[out.length - 1], p)) continue;
      out.push({ x: p.x, y: p.y });
    }
    let changed = true;
    while (changed && out.length > 2) {
      changed = false;
      for (let i = 1; i < out.length - 1; i++) {
        const a = out[i - 1];
        const b = out[i];
        const c = out[i + 1];
        const horiz = Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS;
        const vert = Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS;
        if (horiz || vert) {
          out.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- Hulls

  /** Andrew's monotone chain. Returns the hull without repeating the start. */
  function convexHull(points) {
    const pts = points.map((p) => ({ x: p.x, y: p.y }))
      .sort((a, b) => (a.x - b.x) || (a.y - b.y));
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  /** Convex hull grown outward by `pad` with round corners (Minkowski sum). */
  function paddedHull(points, pad, steps = 16) {
    if (!(pad > 0)) return convexHull(points);
    const grown = [];
    for (const p of points) {
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        grown.push({ x: p.x + Math.cos(a) * pad, y: p.y + Math.sin(a) * pad });
      }
    }
    return convexHull(grown);
  }

  function rectPolygon(b) {
    return [
      { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
    ];
  }

  /** Box that overlaps both a and b, joining them (with a staircase if diagonal). */
  function bridgeBox(a, b, t) {
    const span = (a0, a1, b0, b1) => {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (lo < hi) return [lo, Math.min(hi, lo + Math.max(t, (hi - lo) / 2))];
      return [Math.min(a1, b1) - t, Math.max(a0, b0) + t];
    };
    const [x0, x1] = span(a.x, a.x + a.w, b.x, b.x + b.w);
    const [y0, y1] = span(a.y, a.y + a.h, b.y, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Rectilinear outline around a set of boxes: the union of the boxes made
   * orthogonally convex (every horizontal and vertical line crosses it once)
   * and hole-free, so the result is one tidy stepped outline. Boxes that
   * don't touch are joined with bridge boxes; if that fails the bounding
   * rectangle is returned.
   */
  function orthoOutline(boxes, bridge = 20) {
    if (!boxes.length) return [];
    let all = boxes.slice();
    for (let iter = 0; iter < boxes.length + 2; iter++) {
      const res = orthoCells(all);
      if (res.loop) return res.loop;
      if (!res.components) break;
      // Join the first component to its nearest neighbour and try again.
      const a = res.components[0];
      let best = null;
      for (let k = 1; k < res.components.length; k++) {
        const c = res.components[k];
        const gx = Math.max(0, c.x - (a.x + a.w), a.x - (c.x + c.w));
        const gy = Math.max(0, c.y - (a.y + a.h), a.y - (c.y + c.h));
        const d = gx + gy;
        if (!best || d < best.d) best = { d, c };
      }
      all = all.concat([bridgeBox(a, best.c, bridge)]);
    }
    return rectPolygon(bboxOf(boxes.flatMap(rectPolygon)));
  }

  /** Cell-grid core of orthoOutline: { loop } or { components: [bbox...] }. */
  function orthoCells(boxes) {
    const uniq = (arr) => Array.from(new Set(arr.map((v) => Math.round(v * 100) / 100)))
      .sort((a, b) => a - b);
    const xs = uniq(boxes.flatMap((b) => [b.x, b.x + b.w]));
    const ys = uniq(boxes.flatMap((b) => [b.y, b.y + b.h]));
    const nx = xs.length - 1;
    const ny = ys.length - 1;
    if (nx < 1 || ny < 1) return { loop: rectPolygon(bboxOf(boxes.flatMap(rectPolygon))) };
    const cell = new Uint8Array(nx * ny);
    const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny) ? cell[j * nx + i] : 0;
    const idx = (arr, v) => {
      const r = Math.round(v * 100) / 100;
      let k = 0;
      while (k < arr.length - 1 && arr[k] < r) k++;
      return k;
    };
    for (const b of boxes) {
      const i0 = idx(xs, b.x);
      const i1 = idx(xs, b.x + b.w);
      const j0 = idx(ys, b.y);
      const j1 = idx(ys, b.y + b.h);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) cell[j * nx + i] = 1;
    }
    // Orthogonal convex fill: fill each row and column between its extremes.
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < ny; j++) {
        let lo = -1;
        let hi = -1;
        for (let i = 0; i < nx; i++) if (cell[j * nx + i]) { if (lo < 0) lo = i; hi = i; }
        for (let i = lo + 1; lo >= 0 && i < hi; i++) {
          if (!cell[j * nx + i]) { cell[j * nx + i] = 1; changed = true; }
        }
      }
      for (let i = 0; i < nx; i++) {
        let lo = -1;
        let hi = -1;
        for (let j = 0; j < ny; j++) if (cell[j * nx + i]) { if (lo < 0) lo = j; hi = j; }
        for (let j = lo + 1; lo >= 0 && j < hi; j++) {
          if (!cell[j * nx + i]) { cell[j * nx + i] = 1; changed = true; }
        }
      }
    }
    // Connected components (4-neighbour flood fill), as world-space bboxes.
    const seen = new Uint8Array(cell.length);
    const components = [];
    for (let start = 0; start < cell.length; start++) {
      if (!cell[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let i0 = Infinity;
      let i1 = -1;
      let j0 = Infinity;
      let j1 = -1;
      while (stack.length) {
        const k = stack.pop();
        const i = k % nx;
        const j = (k - i) / nx;
        i0 = Math.min(i0, i);
        i1 = Math.max(i1, i);
        j0 = Math.min(j0, j);
        j1 = Math.max(j1, j);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di;
          const jj = j + dj;
          if (at(ii, jj) && !seen[jj * nx + ii]) { seen[jj * nx + ii] = 1; stack.push(jj * nx + ii); }
        }
      }
      components.push({ x: xs[i0], y: ys[j0], w: xs[i1 + 1] - xs[i0], h: ys[j1 + 1] - ys[j0] });
    }
    if (components.length !== 1) return { components };
    // Directed boundary edges, clockwise on screen (interior on the right).
    const next = new Map();
    const key = (i, j) => i + ',' + j;
    const addEdge = (a, b) => next.set(key(a[0], a[1]), b);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!at(i, j)) continue;
        if (!at(i, j - 1)) addEdge([i, j], [i + 1, j]);
        if (!at(i + 1, j)) addEdge([i + 1, j], [i + 1, j + 1]);
        if (!at(i, j + 1)) addEdge([i + 1, j + 1], [i, j + 1]);
        if (!at(i - 1, j)) addEdge([i, j + 1], [i, j]);
      }
    }
    const startKey = next.keys().next().value;
    const loop = [];
    let k = startKey;
    let guard = next.size + 2;
    do {
      const [i, j] = k.split(',').map(Number);
      loop.push({ x: xs[i], y: ys[j] });
      const n = next.get(k);
      if (!n) break;
      k = key(n[0], n[1]);
    } while (k !== startKey && --guard > 0);
    // Drop collinear vertices (treating the loop as closed).
    const out = [];
    for (let m = 0; m < loop.length; m++) {
      const a = loop[(m - 1 + loop.length) % loop.length];
      const b = loop[m];
      const c = loop[(m + 1) % loop.length];
      const straight = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!straight) out.push(b);
    }
    return { loop: out };
  }

  /** Closed polygon path with corners rounded by up to `radius`. */
  function polygonPath(pts, radius = 0) {
    const n = pts.length;
    if (n < 2) return '';
    const f = (v) => Math.round(v * 100) / 100;
    if (!(radius > 0) || n < 3) {
      return 'M' + pts.map((p) => f(p.x) + ' ' + f(p.y)).join(' L') + ' Z';
    }
    let d = '';
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const p = pts[i];
      const nxt = pts[(i + 1) % n];
      const l1 = dist(prev, p);
      const l2 = dist(p, nxt);
      const r = Math.min(radius, l1 / 2, l2 / 2);
      const a = l1 ? lerp(p, prev, r / l1) : p;
      const b = l2 ? lerp(p, nxt, r / l2) : p;
      d += (i === 0 ? 'M' : ' L') + f(a.x) + ' ' + f(a.y) + ' Q' + f(p.x) + ' ' + f(p.y) + ' ' + f(b.x) + ' ' + f(b.y);
    }
    return d + ' Z';
  }

  function polylinePath(pts) {
    const f = (v) => Math.round(v * 100) / 100;
    return pts.map((p, i) => (i ? 'L' : 'M') + f(p.x) + ' ' + f(p.y)).join(' ');
  }

  FD.geom = {
    EPS, rotate, rotateVec, axisDir, center, localToWorld, worldToLocal, corners,
    bboxOf, nodeBBox, unionBox, inflate, boxesIntersect, boxContains, strictlyInside,
    snap, dist, lerp, projectOnSegment, polylineLength, pointAlong, nearestOnPolyline,
    quadPoint, quadSamples, aligned, samePoint, simplifyOrtho, convexHull, paddedHull,
    rectPolygon, orthoOutline, polygonPath, polylinePath,
  };
})(typeof window !== 'undefined' ? window : globalThis);
