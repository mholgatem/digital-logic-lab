// ---------------------------------------------------------------------------
// Shape library for the Flow Diagram Designer.
//
// Every shape draws itself as an SVG markup string in a local w×h box (the
// app wraps it in a translate/rotate group), so resizing changes geometry
// rather than scaling strokes. `ports(n)` lists named connection points in
// the same local frame: { id, x, y, dir } with dir pointing out of the shape.
//
// Paint `p` holds resolved CSS colour strings:
//   { fill, stroke, sw, dash, ink, pin }
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const FD = root.FlowDiagram = root.FlowDiagram || {};

  const LEFT = { x: -1, y: 0 };
  const RIGHT = { x: 1, y: 0 };
  const UP = { x: 0, y: -1 };
  const DOWN = { x: 0, y: 1 };

  const r2 = (v) => Math.round(v * 100) / 100;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sty(p, o = {}) {
    const fill = o.fill !== undefined ? o.fill : p.fill;
    const stroke = o.stroke !== undefined ? o.stroke : p.stroke;
    const sw = o.sw !== undefined ? o.sw : p.sw;
    let s = 'fill:' + fill + ';stroke:' + stroke + ';stroke-width:' + sw +
      ';stroke-linejoin:round;stroke-linecap:round';
    if (p.dash && !o.solid) s += ';stroke-dasharray:' + p.dash;
    return 'style="' + s + '"';
  }

  function line(p, x1, y1, x2, y2, o = {}) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" ' +
      sty(p, Object.assign({ fill: 'none', solid: true }, o)) + '/>';
  }

  function text(p, x, y, str, o = {}) {
    const size = o.size || 12;
    const anchor = o.anchor || 'middle';
    const deco = o.over ? ';text-decoration:overline' : '';
    const weight = o.bold ? ';font-weight:600' : '';
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" text-anchor="' + anchor +
      '" dominant-baseline="central" style="fill:' + (o.color || p.pin) + ';font-size:' + size +
      'px;stroke:none' + deco + weight + '">' + esc(str) + '</text>';
  }

  function sidePorts(w, h) {
    return [
      { id: 'n', x: w / 2, y: 0, dir: UP },
      { id: 'e', x: w, y: h / 2, dir: RIGHT },
      { id: 's', x: w / 2, y: h, dir: DOWN },
      { id: 'w', x: 0, y: h / 2, dir: LEFT },
    ];
  }

  function polygon(p, pts, o) {
    return '<polygon points="' + pts.map(([x, y]) => r2(x) + ',' + r2(y)).join(' ') + '" ' + sty(p, o) + '/>';
  }

  function pathEl(p, d, o) {
    return '<path d="' + d + '" ' + sty(p, o) + '/>';
  }

  // ------------------------------------------------------------ Logic gates

  const BUBBLE_R = 5;

  function gateInputs(n) {
    return Math.max(1, Math.min(8, Math.round(n.props.inputs || 2)));
  }

  /** x of the concave back curve of an OR body (depth c) at height y. */
  function orBackX(y, h, c) {
    const t = 1 - y / h;
    return 2 * t * (1 - t) * c;
  }

  function gateDraw(kind) {
    const inv = /^(nand|nor|xnor|not)$/.test(kind);
    return function (n, p) {
      const { w, h } = n;
      const bw = w - (inv ? BUBBLE_R * 2 : 0);
      const single = kind === 'not' || kind === 'buf' || kind === 'tri';
      const count = single ? 1 : gateInputs(n);
      let out = '';
      if (kind === 'and' || kind === 'nand') {
        out += pathEl(p, 'M0 0 H' + r2(bw / 2) + ' A' + r2(bw / 2) + ' ' + r2(h / 2) + ' 0 0 1 ' +
          r2(bw / 2) + ' ' + h + ' H0 Z');
      } else if (kind === 'or' || kind === 'nor' || kind === 'xor' || kind === 'xnor') {
        const s = (kind === 'xor' || kind === 'xnor') ? 8 : 0;
        const c = (bw - s) * 0.25;
        out += pathEl(p, 'M' + s + ' 0 Q' + r2(s + (bw - s) * 0.55) + ' 0 ' + r2(bw) + ' ' + r2(h / 2) +
          ' Q' + r2(s + (bw - s) * 0.55) + ' ' + h + ' ' + s + ' ' + h +
          ' Q' + r2(s + c) + ' ' + r2(h / 2) + ' ' + s + ' 0 Z');
        if (s) out += pathEl(p, 'M0 0 Q' + r2(c) + ' ' + r2(h / 2) + ' 0 ' + h, { fill: 'none' });
        for (let i = 0; i < count; i++) {
          const y = h * (i + 1) / (count + 1);
          const x = s + orBackX(y, h, c);
          if (x > 1) out += line(p, 0, y, x, y);
        }
      } else {
        out += polygon(p, [[0, 0], [bw, h / 2], [0, h]]);
        if (kind === 'tri') out += line(p, bw / 2, 0, bw / 2, h / 4);
      }
      if (inv) {
        out += '<circle cx="' + r2(bw + BUBBLE_R) + '" cy="' + r2(h / 2) + '" r="' + BUBBLE_R + '" ' + sty(p) + '/>';
      }
      return out;
    };
  }

  function gatePorts(kind) {
    return function (n) {
      const { w, h } = n;
      const single = kind === 'not' || kind === 'buf' || kind === 'tri';
      const count = single ? 1 : gateInputs(n);
      const ports = [];
      for (let i = 0; i < count; i++) {
        ports.push({ id: 'in' + i, x: 0, y: h * (i + 1) / (count + 1), dir: LEFT });
      }
      ports.push({ id: 'out', x: w, y: h / 2, dir: RIGHT });
      if (kind === 'tri') {
        ports.push({ id: 'en', x: (w) / 2, y: 0, dir: UP });
      }
      return ports;
    };
  }

  // ------------------------------------------------------- Pin-labelled box

  /**
   * Pin syntax (comma separated, per side):
   *   Name   plain labelled pin        >Clk  clock edge triangle
   *   !Name  inversion bubble          ~Q    overlined name (Q-bar)
   *   _      unlabelled pin            >     clock triangle, no text
   */
  function parsePins(str) {
    if (!str) return [];
    return String(str).split(',').map((raw) => raw.trim()).filter((s) => s.length)
      .map((tok) => {
        let s = tok;
        const invert = s.startsWith('!');
        if (invert) s = s.slice(1);
        const clock = s.startsWith('>');
        if (clock) s = s.slice(1);
        const over = s.startsWith('~');
        if (over) s = s.slice(1);
        return { name: s === '_' ? '' : s, invert, clock, over };
      });
  }

  const SIDES = ['top', 'right', 'bottom', 'left'];

  function pinLayout(n) {
    const { w, h } = n;
    const pins = n.props.pins || {};
    const out = [];
    for (const side of SIDES) {
      const list = parsePins(pins[side]);
      list.forEach((pin, i) => {
        const f = (i + 1) / (list.length + 1);
        let x;
        let y;
        let dir;
        if (side === 'top') { x = w * f; y = 0; dir = UP; }
        if (side === 'bottom') { x = w * f; y = h; dir = DOWN; }
        if (side === 'left') { x = 0; y = h * f; dir = LEFT; }
        if (side === 'right') { x = w; y = h * f; dir = RIGHT; }
        out.push(Object.assign({ side, x, y, dir, idx: i }, pin));
      });
    }
    return out;
  }

  function pinBlockDraw(n, p) {
    const { w, h } = n;
    let out = '<rect x="0" y="0" width="' + w + '" height="' + h + '" ' + sty(p) + '/>';
    const T = 7; // clock triangle half-size
    for (const pin of pinLayout(n)) {
      const { x, y, side } = pin;
      const inward = { x: -pin.dir.x, y: -pin.dir.y };
      let inset = 5;
      if (pin.clock) {
        const tip = { x: x + inward.x * T * 1.3, y: y + inward.y * T * 1.3 };
        const along = { x: Math.abs(pin.dir.y), y: Math.abs(pin.dir.x) };
        out += '<polyline points="' + r2(x - along.x * T) + ',' + r2(y - along.y * T) + ' ' + r2(tip.x) + ',' +
          r2(tip.y) + ' ' + r2(x + along.x * T) + ',' + r2(y + along.y * T) + '" ' + sty(p, { fill: 'none', solid: true }) + '/>';
        inset = T * 1.3 + 4;
      }
      if (pin.invert) {
        out += '<circle cx="' + r2(x + pin.dir.x * BUBBLE_R) + '" cy="' + r2(y + pin.dir.y * BUBBLE_R) + '" r="' +
          BUBBLE_R + '" ' + sty(p, { solid: true }) + '/>';
      }
      if (pin.name) {
        let tx = x + inward.x * inset;
        let ty = y + inward.y * inset;
        let anchor = 'middle';
        if (side === 'left') anchor = 'start';
        if (side === 'right') anchor = 'end';
        if (side === 'top') ty += 5;
        if (side === 'bottom') ty -= 5;
        out += text(p, tx, ty, pin.name, { anchor, size: 11, over: pin.over });
      }
    }
    return out;
  }

  function pinBlockPorts(n) {
    return pinLayout(n).map((pin) => ({
      id: pin.side[0] + pin.idx,
      label: pin.name,
      x: pin.x + (pin.invert ? pin.dir.x * BUBBLE_R * 2 : 0),
      y: pin.y + (pin.invert ? pin.dir.y * BUBBLE_R * 2 : 0),
      dir: pin.dir,
    }));
  }

  const PIN_UI = [
    { key: 'pins.top', label: 'Top pins', type: 'text' },
    { key: 'pins.right', label: 'Right pins', type: 'text' },
    { key: 'pins.bottom', label: 'Bottom pins', type: 'text' },
    { key: 'pins.left', label: 'Left pins', type: 'text' },
  ];
  const PIN_HINT = 'Comma separated. >Clk = clock edge, !EN = bubble, ~Q = overline, _ = unlabelled.';

  function pinBlock(id, cat, name, w, h, label, pins, extra = {}) {
    return Object.assign({
      id, cat, name, w, h, label,
      props: { pins },
      draw: pinBlockDraw,
      ports: pinBlockPorts,
      ui: PIN_UI,
      hint: PIN_HINT,
    }, extra);
  }

  // ------------------------------------------------------- Field/cell bars

  function parseFields(str) {
    return String(str || '').split(',').map((tok) => {
      const m = /^\s*([^:]*?)\s*(?::\s*(\d+)\s*(?:-\s*(\d+))?)?\s*$/.exec(tok) || [];
      const name = (m[1] || '').trim();
      const hi = m[2] !== undefined ? Number(m[2]) : null;
      const lo = m[3] !== undefined ? Number(m[3]) : hi;
      const bits = hi !== null ? Math.abs(hi - lo) + 1 : 1;
      return { name, hi, lo, bits };
    });
  }

  function fieldCells(n) {
    if (n.type === 'cells') {
      const count = Math.max(1, Math.min(32, Math.round(n.props.cells || 4)));
      return Array.from({ length: count }, () => ({ name: '', hi: null, lo: null, bits: 1 }));
    }
    return parseFields(n.props.fields);
  }

  function fieldLayout(n) {
    const cells = fieldCells(n);
    const total = cells.reduce((s, c) => s + c.bits, 0) || 1;
    let acc = 0;
    return cells.map((c) => {
      const x0 = n.w * acc / total;
      acc += c.bits;
      return Object.assign({ x0, x1: n.w * acc / total }, c);
    });
  }

  function fieldsDraw(n, p) {
    const { w, h } = n;
    let out = '<rect x="0" y="0" width="' + w + '" height="' + h + '" ' + sty(p) + '/>';
    const cells = fieldLayout(n);
    cells.forEach((c, i) => {
      if (i) out += line(p, c.x0, 0, c.x0, h);
      if (c.name) out += text(p, (c.x0 + c.x1) / 2, h / 2, c.name, { size: 12 });
      if (n.props.showBits !== false && c.hi !== null) {
        out += text(p, c.x0 + 3, -9, String(c.hi), { anchor: 'start', size: 11 });
        if (c.lo !== c.hi) out += text(p, c.x1 - 3, -9, String(c.lo), { anchor: 'end', size: 11 });
      }
      if (n.props.showWidths && c.hi !== null) {
        out += text(p, (c.x0 + c.x1) / 2, h + 10, c.bits + (c.bits === 1 ? ' bit' : ' bits'), { size: 11 });
      }
    });
    return out;
  }

  function fieldsPorts(n) {
    const ports = [];
    fieldLayout(n).forEach((c, i) => {
      const x = (c.x0 + c.x1) / 2;
      ports.push({ id: 'f' + i + 't', x, y: 0, dir: UP, label: c.name });
      ports.push({ id: 'f' + i + 'b', x, y: n.h, dir: DOWN, label: c.name });
    });
    ports.push({ id: 'w', x: 0, y: n.h / 2, dir: LEFT }, { id: 'e', x: n.w, y: n.h / 2, dir: RIGHT });
    return ports;
  }

  // ----------------------------------------------------------- Mux / ALU

  function muxInputs(n) {
    return Math.max(2, Math.min(16, Math.round(n.props.inputs || 2)));
  }

  function muxDraw(demux) {
    return function (n, p) {
      const { w, h } = n;
      const pts = demux ? [[0, h * 0.2], [w, 0], [w, h], [0, h * 0.8]] : [[0, 0], [w, h * 0.2], [w, h * 0.8], [0, h]];
      let out = polygon(p, pts);
      if (n.props.numbers !== false) {
        const count = muxInputs(n);
        for (let i = 0; i < count; i++) {
          const y = h * (i + 1) / (count + 1);
          out += demux ? text(p, w - 6, y, String(i), { anchor: 'end', size: 10 }) :
            text(p, 6, y, String(i), { anchor: 'start', size: 10 });
        }
      }
      return out;
    };
  }

  function muxPorts(demux) {
    return function (n) {
      const { w, h } = n;
      const count = muxInputs(n);
      const ports = [];
      for (let i = 0; i < count; i++) {
        const y = h * (i + 1) / (count + 1);
        ports.push(demux ? { id: 'out' + i, x: w, y, dir: RIGHT } : { id: 'in' + i, x: 0, y, dir: LEFT });
      }
      ports.push(demux ? { id: 'in', x: 0, y: h / 2, dir: LEFT } : { id: 'out', x: w, y: h / 2, dir: RIGHT });
      ports.push({ id: 'sel', x: w / 2, y: h * 0.9, dir: DOWN });
      return ports;
    };
  }

  function aluDraw(n, p) {
    const { w, h } = n;
    return polygon(p, [[0, 0], [w, h * 0.3], [w, h * 0.7], [0, h], [0, h * 0.6], [w * 0.2, h * 0.5], [0, h * 0.4]]);
  }

  function aluPorts(n) {
    const { w, h } = n;
    return [
      { id: 'a', x: 0, y: h * 0.2, dir: LEFT, label: 'A' },
      { id: 'b', x: 0, y: h * 0.8, dir: LEFT, label: 'B' },
      { id: 'out', x: w, y: h / 2, dir: RIGHT },
      { id: 'op', x: w / 2, y: h * 0.15, dir: UP },
      { id: 'flags', x: w / 2, y: h * 0.85, dir: DOWN },
    ];
  }

  // -------------------------------------------------------- Simple shapes

  function rectDraw(rx) {
    return function (n, p) {
      const r = typeof rx === 'function' ? rx(n) : rx;
      return '<rect x="0" y="0" width="' + n.w + '" height="' + n.h + '" rx="' + r2(r) + '" ' + sty(p) + '/>';
    };
  }

  function ellipseDraw(n, p) {
    return '<ellipse cx="' + r2(n.w / 2) + '" cy="' + r2(n.h / 2) + '" rx="' + r2(n.w / 2) + '" ry="' + r2(n.h / 2) +
      '" ' + sty(p) + '/>';
  }

  function polyDraw(fn) {
    return (n, p) => polygon(p, fn(n.w, n.h));
  }

  function basic(id, cat, name, w, h, draw, extra = {}) {
    return Object.assign({ id, cat, name, w, h, label: '', draw, ports: (n) => sidePorts(n.w, n.h) }, extra);
  }

  const pill = (n) => Math.min(n.w, n.h) / 2;

  // --------------------------------------------------------- The registry

  const CATEGORIES = [
    { id: 'basic', name: 'Basic' },
    { id: 'logic', name: 'Logic gates' },
    { id: 'datapath', name: 'Datapath' },
    { id: 'ff', name: 'Flip-flops & latches' },
    { id: 'flow', name: 'Flowchart / ASM' },
    { id: 'annot', name: 'Annotations' },
  ];

  const GATE_UI = [{ key: 'inputs', label: 'Inputs', type: 'number', min: 2, max: 8 }];

  function gate(id, name, kind, extra = {}) {
    const inv = /^(nand|nor|xnor|not)$/.test(kind);
    const single = kind === 'not' || kind === 'buf' || kind === 'tri';
    return Object.assign({
      id, cat: 'logic', name, w: single ? 50 + (inv ? 10 : 0) : 70 + (inv ? 10 : 0), h: single ? 40 : 50,
      label: '', fill: 'paper', props: single ? {} : { inputs: 2 },
      draw: gateDraw(kind), ports: gatePorts(kind), ui: single ? [] : GATE_UI, labelPos: 'below',
    }, extra);
  }

  const SHAPES = [
    // Basic
    basic('rect', 'basic', 'Rectangle', 120, 70, rectDraw(0)),
    basic('rounded', 'basic', 'Rounded rectangle', 120, 70, rectDraw((n) => Math.min(12, n.h / 4, n.w / 4))),
    basic('square', 'basic', 'Square', 80, 80, rectDraw(0), { lockAspect: true }),
    basic('circle', 'basic', 'Circle', 80, 80, ellipseDraw, { lockAspect: true, boundary: 'ellipse' }),
    basic('ellipse', 'basic', 'Ellipse', 120, 70, ellipseDraw, { boundary: 'ellipse' }),
    basic('triangle', 'basic', 'Triangle', 90, 80, polyDraw((w, h) => [[w / 2, 0], [w, h], [0, h]])),
    basic('diamond', 'basic', 'Diamond', 100, 80, polyDraw((w, h) => [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
      { boundary: 'diamond' }),
    basic('pill', 'basic', 'Pill', 120, 50, rectDraw(pill)),
    basic('hexagon', 'basic', 'Hexagon', 110, 70, polyDraw((w, h) => [[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]])),
    basic('parallelogram', 'basic', 'Parallelogram', 120, 60, polyDraw((w, h) => [[w * 0.18, 0], [w, 0], [w * 0.82, h], [0, h]])),
    { id: 'line', cat: 'basic', name: 'Line', kind: 'edge', edge: { arrowEnd: 'none' } },
    { id: 'arrow', cat: 'basic', name: 'Arrow', kind: 'edge', edge: { arrowEnd: 'arrow' } },
    { id: 'arrow2', cat: 'basic', name: 'Double arrow', kind: 'edge', edge: { arrowStart: 'arrow', arrowEnd: 'arrow' } },

    // Logic
    gate('and', 'AND', 'and'),
    gate('or', 'OR', 'or'),
    gate('not', 'NOT', 'not'),
    gate('nand', 'NAND', 'nand'),
    gate('nor', 'NOR', 'nor'),
    gate('xor', 'XOR', 'xor'),
    gate('xnor', 'XNOR', 'xnor'),
    gate('buf', 'Buffer', 'buf'),
    gate('tri', 'Tri-state buffer', 'tri'),

    // Datapath
    pinBlock('register', 'datapath', 'Register', 100, 70, 'Register', { left: 'D', right: 'Q', bottom: '>' }),
    pinBlock('regfile', 'datapath', 'Register file', 170, 110, '16 8-bit\nRegisters',
      { top: 'RA, RB, RD', left: 'D', right: 'A, B', bottom: '>' }),
    {
      id: 'alu', cat: 'datapath', name: 'ALU', w: 70, h: 110, label: 'ALU', fill: 'paper',
      draw: aluDraw, ports: aluPorts, labelOffset: { x: 8, y: 0 },
    },
    {
      id: 'adder', cat: 'datapath', name: 'Adder', w: 60, h: 90, label: '+', fill: 'paper',
      draw: aluDraw, ports: aluPorts, labelOffset: { x: 8, y: 0 }, labelSize: 20,
    },
    {
      id: 'mux', cat: 'datapath', name: 'Multiplexer', w: 50, h: 100, label: 'MUX', fill: 'paper',
      props: { inputs: 2, numbers: true }, draw: muxDraw(false), ports: muxPorts(false), labelRotation: 0, labelSize: 11,
      ui: [{ key: 'inputs', label: 'Inputs', type: 'number', min: 2, max: 16 },
        { key: 'numbers', label: 'Number inputs', type: 'checkbox' }],
    },
    {
      id: 'demux', cat: 'datapath', name: 'Demultiplexer', w: 50, h: 100, label: 'DEMUX', fill: 'paper',
      props: { inputs: 2, numbers: true }, draw: muxDraw(true), ports: muxPorts(true), labelSize: 10,
      ui: [{ key: 'inputs', label: 'Outputs', type: 'number', min: 2, max: 16 },
        { key: 'numbers', label: 'Number outputs', type: 'checkbox' }],
    },
    pinBlock('memory', 'datapath', 'Memory', 130, 120, 'Memory', { left: 'Addr, Data In', right: 'Data Out', top: 'WE', bottom: '>' }),
    pinBlock('pc', 'datapath', 'Program counter', 40, 90, 'PC', { left: '_', right: '_', bottom: '>' },
      { labelRotation: -90 }),
    pinBlock('counter', 'datapath', 'Counter', 110, 90, 'Counter', { left: 'EN, CLR, >', right: 'Q' }),
    pinBlock('decoder', 'datapath', 'Decoder', 90, 120, '2:4\nDecoder', { left: 'A0, A1', right: 'Y0, Y1, Y2, Y3', bottom: 'EN' }),
    pinBlock('block', 'datapath', 'Block with pins', 120, 90, 'Block', { left: 'In', right: 'Out' }),
    basic('nextaddr', 'datapath', 'Next Addr', 30, 90, rectDraw(pill), { label: 'Next Addr', labelRotation: -90, labelSize: 11 }),
    {
      id: 'fields', cat: 'datapath', name: 'Instruction format', w: 340, h: 30, label: '',
      props: { fields: 'OPCODE:15-12, RA:11-8, RB:7-4, RD:3-0', showBits: true, showWidths: false },
      draw: fieldsDraw, ports: fieldsPorts,
      ui: [{ key: 'fields', label: 'Fields', type: 'text' },
        { key: 'showBits', label: 'Bit numbers', type: 'checkbox' },
        { key: 'showWidths', label: 'Field widths', type: 'checkbox' }],
      hint: 'Name:hi-lo, comma separated (e.g. OPCODE:15-12, RA:11-8).',
    },
    {
      id: 'cells', cat: 'datapath', name: 'Register cells', w: 120, h: 24, label: '',
      props: { cells: 4 }, draw: fieldsDraw, ports: fieldsPorts,
      ui: [{ key: 'cells', label: 'Cells', type: 'number', min: 1, max: 32 }],
    },

    // Flip-flops & latches
    pinBlock('dff', 'ff', 'D flip-flop', 80, 90, '', { left: 'D, >', right: 'Q, ~Q' }),
    pinBlock('tff', 'ff', 'T flip-flop', 80, 90, '', { left: 'T, >', right: 'Q, ~Q' }),
    pinBlock('jkff', 'ff', 'JK flip-flop', 80, 100, '', { left: 'J, >, K', right: 'Q, ~Q' }),
    pinBlock('srff', 'ff', 'SR flip-flop', 80, 100, '', { left: 'S, >, R', right: 'Q, ~Q' }),
    pinBlock('dffr', 'ff', 'D flip-flop (PRE/CLR)', 90, 110, '', { top: '!~PRE', left: 'D, >', right: 'Q, ~Q', bottom: '!~CLR' }),
    pinBlock('srlatch', 'ff', 'SR latch', 80, 90, '', { left: 'S, R', right: 'Q, ~Q' }),
    pinBlock('dlatch', 'ff', 'D latch', 80, 90, '', { left: 'D, EN', right: 'Q, ~Q' }),

    // Flowchart / ASM
    basic('process', 'flow', 'Process', 120, 60, rectDraw(0), { label: 'Process' }),
    basic('decision', 'flow', 'Decision', 110, 80, polyDraw((w, h) => [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
      { label: 'Cond?', boundary: 'diamond' }),
    basic('terminator', 'flow', 'Start / end', 110, 46, rectDraw(pill), { label: 'Start' }),
    basic('io', 'flow', 'Input / output', 120, 60, polyDraw((w, h) => [[w * 0.18, 0], [w, 0], [w * 0.82, h], [0, h]]),
      { label: 'I/O' }),
    basic('predefined', 'flow', 'Predefined process', 130, 60, (n, p) => rectDraw(0)(n, p) +
      line(p, 10, 0, 10, n.h) + line(p, n.w - 10, 0, n.w - 10, n.h), { label: 'Subroutine' }),
    basic('asmstate', 'flow', 'ASM state box', 120, 60, rectDraw(0), { label: 'Z = 1', labelPos: 'center' }),
    basic('asmcond', 'flow', 'ASM conditional output', 120, 46, rectDraw(pill), { label: 'Y = 1' }),
    basic('connector', 'flow', 'Connector', 36, 36, ellipseDraw, { label: 'A', lockAspect: true, boundary: 'ellipse' }),

    // Annotations
    basic('text', 'annot', 'Text', 100, 30, () => '', { label: 'Text', fill: 'none', stroke: 'none', labelSize: 16 }),
    basic('title', 'annot', 'Title', 200, 40, () => '', { label: 'Title', fill: 'none', stroke: 'none', labelSize: 28, labelBold: true, labelColor: 'vw-orange' }),
    basic('note', 'annot', 'Note', 130, 80, (n, p) => {
      const f = Math.min(16, n.w / 4, n.h / 4);
      return polygon(p, [[0, 0], [n.w - f, 0], [n.w, f], [n.w, n.h], [0, n.h]]) +
        polygon(p, [[n.w - f, 0], [n.w - f, f], [n.w, f]], { fill: 'none' });
    }, { label: 'Note', fill: 'tint-yellow' }),
    {
      id: 'junction', cat: 'annot', name: 'Junction dot', w: 10, h: 10, label: '', lockAspect: true, boundary: 'ellipse',
      draw: (n, p) => '<circle cx="' + r2(n.w / 2) + '" cy="' + r2(n.h / 2) + '" r="' + r2(Math.min(n.w, n.h) / 2) + '" ' +
        sty(p, { fill: p.stroke }) + '/>',
      ports: (n) => sidePorts(n.w, n.h), noLabel: true,
    },
    {
      id: 'busslash', cat: 'annot', name: 'Bus width', w: 16, h: 24, label: '8', labelPos: 'after', labelSize: 13,
      draw: (n, p) => line(p, 0, n.h, n.w, 0, { sw: p.sw }), ports: () => [],
    },
    {
      id: 'vcc', cat: 'annot', name: 'VCC', w: 30, h: 30, label: 'VCC', labelPos: 'above', labelSize: 11,
      draw: (n, p) => line(p, n.w / 2, n.h, n.w / 2, n.h * 0.2) + line(p, 0, n.h * 0.2, n.w, n.h * 0.2),
      ports: (n) => [{ id: 's', x: n.w / 2, y: n.h, dir: DOWN }],
    },
    {
      id: 'ground', cat: 'annot', name: 'Ground', w: 30, h: 30, label: '', noLabel: false,
      draw: (n, p) => line(p, n.w / 2, 0, n.w / 2, n.h * 0.45) + line(p, 0, n.h * 0.45, n.w, n.h * 0.45) +
        line(p, n.w * 0.2, n.h * 0.7, n.w * 0.8, n.h * 0.7) + line(p, n.w * 0.4, n.h * 0.95, n.w * 0.6, n.h * 0.95),
      ports: (n) => [{ id: 'n', x: n.w / 2, y: 0, dir: UP }],
    },
    {
      id: 'clock', cat: 'annot', name: 'Clock source', w: 60, h: 40, label: 'Clk', labelPos: 'below', labelSize: 12,
      draw: (n, p) => {
        const { w, h } = n;
        const y0 = h * 0.7;
        const y1 = h * 0.3;
        const xs = [0.15, 0.3, 0.3, 0.5, 0.5, 0.7, 0.7, 0.85].map((f) => f * w);
        const ys = [y0, y0, y1, y1, y0, y0, y1, y1];
        return '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="4" ' + sty(p) + '/>' +
          '<polyline points="' + xs.map((x, i) => r2(x) + ',' + r2(ys[i])).join(' ') + '" ' +
          sty(p, { fill: 'none', solid: true }) + '/>';
      },
      ports: (n) => [{ id: 'e', x: n.w, y: n.h / 2, dir: RIGHT }, { id: 's', x: n.w / 2, y: n.h, dir: DOWN }],
    },
  ];

  const BY_ID = {};
  for (const s of SHAPES) BY_ID[s.id] = s;

  function get(id) {
    return BY_ID[id] || BY_ID.rect;
  }

  FD.shapes = { CATEGORIES, SHAPES, get, parsePins, parseFields, esc, sidePorts };
})(typeof window !== 'undefined' ? window : globalThis);
