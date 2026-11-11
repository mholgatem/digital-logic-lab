// Builds FlowDiagramDesigner/examples/*.json from the shape library defaults.
// Run from the repo root: node FlowDiagramDesigner/examples/build_examples.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
for (const f of ['geometry.js', 'routing.js', 'shapes.js', 'serialize.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'lib', f), 'utf8'), ctx);
}
const S = ctx.FlowDiagram.shapes;
const IO = ctx.FlowDiagram.io;

function builder() {
  let next = 1;
  const doc = { name: '', nodes: [], edges: [], groups: [], nextId: 1, grid: { size: 10, snap: true, show: true } };
  const id = (p) => p + (next++);
  return {
    doc,
    node(type, x, y, opts = {}) {
      const def = S.get(type);
      const n = {
        id: id('n'), type, x, y, w: opts.w || def.w, h: opts.h || def.h, rotation: opts.rotation || 0,
        fill: opts.fill || def.fill || 'paper', stroke: opts.stroke || def.stroke || 'ink', strokeWidth: opts.sw || 2,
        dash: opts.dash || 'solid',
        label: Object.assign({
          text: def.label || '', pos: def.labelPos || 'center',
          dx: def.labelOffset ? def.labelOffset.x : 0, dy: def.labelOffset ? def.labelOffset.y : 0,
          rotation: def.labelRotation || 0, size: def.labelSize || 14, color: def.labelColor || 'ink', bold: !!def.labelBold,
        }, opts.label || {}),
        props: Object.assign(JSON.parse(JSON.stringify(def.props || {})), opts.props || {}),
      };
      doc.nodes.push(n);
      return n;
    },
    edge(from, to, opts = {}) {
      const e = Object.assign({
        id: id('e'), from, to, style: 'ortho', waypoints: [], manual: false, curve: { u: 0, v: 0 },
        stroke: 'ink', strokeWidth: 2, dash: 'solid', arrowStart: 'none', arrowEnd: 'arrow', busWidth: '', busPos: 0.5, labels: [],
      }, opts);
      if (opts.waypoints) e.manual = true;
      doc.edges.push(e);
      return e;
    },
    group(members, opts = {}) {
      const g = Object.assign({
        id: id('g'), members: members.map((m) => m.id), outline: 'rect', padding: 14, radius: 8,
        stroke: 'vw-orange', strokeWidth: 2, dash: 'dashed', fill: 'none',
      }, opts);
      g.label = Object.assign({ text: '', pos: 'top-left', dx: 0, dy: 0, rotation: 0, size: 18, color: 'vw-orange', bold: true, bg: true }, opts.label || {});
      doc.groups.push(g);
      return g;
    },
    finish(name) {
      doc.name = name;
      doc.nextId = next;
      return doc;
    },
  };
}

const lab = (text, t, extra = {}) => Object.assign({ text, t, dx: 0, dy: 0, rotation: 0, size: 13, color: 'ink', bold: false, bg: true }, extra);
const P = (n, port) => ({ node: n.id, port });

// ------------------------------------------------------------ CPU datapath
{
  const b = builder();
  const fmt = b.node('fields', 300, 20, { w: 420, h: 30, props: { showWidths: true } });
  const imem = b.node('block', 120, 170, { w: 130, h: 100, label: { text: 'Instruction\nMemory', bold: true }, props: { pins: { right: '_', bottom: '_' } } });
  const sixteen = b.node('text', 125, 135, { w: 120, h: 24, label: { text: '← 16 bits →', size: 13 } });
  const ir = b.node('cells', 320, 190, { w: 140, h: 26, props: { cells: 4 } });
  const irText = b.node('text', 300, 150, { w: 180, h: 26, label: { text: 'Instruction Register', size: 14 } });
  const control = b.node('rect', 600, 160, { w: 200, h: 50, fill: 'none', stroke: 'vw-orange', dash: 'dashed',
    label: { text: 'Control', size: 26, color: 'vw-orange', bold: false } });
  const regs = b.node('regfile', 320, 320, { w: 170, h: 110, label: { text: '16 8-bit\nRegisters', bold: true } });
  const alu = b.node('alu', 590, 310, { w: 60, h: 120, label: { text: 'ALU', rotation: -90, dx: 6, bold: true } });
  const wreg = b.node('register', 730, 335, { w: 130, h: 70, label: { text: 'W Register', bold: true }, props: { pins: { left: '_', right: '_', bottom: '>' } } });
  const pc = b.node('pc', 180, 350, { w: 36, h: 90, label: { text: 'PC', rotation: -90, bold: true },
    props: { pins: { top: '_', left: '_', right: '_', bottom: '>' } } });
  const nxt = b.node('nextaddr', 110, 350, { w: 30, h: 90 });

  // Instruction fetch
  b.edge(P(imem, 'r0'), P(ir, 'w'));
  b.edge(P(pc, 't0'), P(imem, 'b0'), { labels: [lab('Instruction Address', 0.5, { dx: -70, color: 'vw-blue', bg: false })], arrowEnd: 'arrow' });
  b.edge(P(nxt, 'e'), P(pc, 'l0'));
  b.edge(P(pc, 'r0'), P(nxt, 's'), { waypoints: [{ x: 240, y: 395 }, { x: 240, y: 470 }, { x: 125, y: 470 }] });
  // Register addresses from the IR fields
  b.edge(P(ir, 'f1b'), P(regs, 't0'), { busWidth: '4', busPos: 0.4 });
  b.edge(P(ir, 'f2b'), P(regs, 't1'), { busWidth: '4', busPos: 0.4 });
  b.edge(P(ir, 'f3b'), P(regs, 't2'), { busWidth: '4', busPos: 0.4 });
  b.edge(P(ir, 'f0t'), P(control, 'w'), { waypoints: [{ x: 337.5, y: 120 }, { x: 560, y: 120 }, { x: 560, y: 185 }] });
  // Data path
  b.edge(P(regs, 'r0'), { node: alu.id, port: 'a' }, { busWidth: '8', labels: [lab('A', 0.15, { dy: -12, bg: false })] });
  b.edge(P(regs, 'r1'), { node: alu.id, port: 'b' }, { busWidth: '8', labels: [lab('B', 0.15, { dy: -12, bg: false })] });
  b.edge({ node: alu.id, port: 'out' }, P(wreg, 'l0'), { busWidth: '8', labels: [lab('Data In', 0.5, { dy: -28, bg: false })] });
  b.edge(P(wreg, 'r0'), P(regs, 'l0'), {
    busWidth: '8', busPos: 0.55,
    waypoints: [{ x: 930, y: 370 }, { x: 930, y: 500 }, { x: 280, y: 500 }, { x: 280, y: 375 }],
    labels: [lab('Data Out', 0.02, { dy: -16 }), lab('D', 0.985, { dy: -14, bg: false })],
  });
  // Control
  b.edge(P(control, 's'), { node: alu.id, port: 'op' }, { labels: [lab('Control Signals', 0.45, { dx: -68, bold: true })] });
  b.edge({ node: alu.id, port: 'flags' }, P(control, 'e'), {
    labels: [lab('Conditions', 0.8, { dx: 50, bold: true })],
  });

  b.group([ir, irText], { outline: 'rect', padding: 10, radius: 6, label: { text: '' } });
  b.group([regs, alu, wreg, pc, nxt], { outline: 'ortho', padding: 24, radius: 12,
    label: { text: 'Datapath', pos: 'bottom', size: 26, bold: true } });
  void fmt;
  void sixteen;
  const doc = b.finish('Simple CPU datapath');
  fs.writeFileSync(path.join(root, 'examples', 'simple-cpu-datapath.json'), IO.toJSON(doc) + '\n');
}

// ------------------------------------------------------------ Half adder
{
  const b = builder();
  const a = b.node('text', 40, 95, { w: 40, h: 30, label: { text: 'A', size: 18, bold: true } });
  const bb = b.node('text', 40, 175, { w: 40, h: 30, label: { text: 'B', size: 18, bold: true } });
  const ja = b.node('junction', 135, 105, { w: 10, h: 10 });
  const jb = b.node('junction', 175, 185, { w: 10, h: 10 });
  const xor = b.node('xor', 260, 80, { w: 80, h: 60, label: { text: '' } });
  const and = b.node('and', 260, 220, { w: 80, h: 60, label: { text: '' } });
  const s = b.node('text', 440, 95, { w: 60, h: 30, label: { text: 'Sum', size: 16, bold: true } });
  const c = b.node('text', 440, 235, { w: 60, h: 30, label: { text: 'Carry', size: 16, bold: true } });
  const title = b.node('title', 120, 0, { w: 260, h: 40, label: { text: 'Half adder' } });
  b.edge(P(a, 'e'), P(ja, 'w'), { arrowEnd: 'none' });
  b.edge(P(ja, 'e'), P(xor, 'in0'), { arrowEnd: 'none' });
  b.edge(P(ja, 's'), P(and, 'in0'), { arrowEnd: 'none' });
  b.edge(P(bb, 'e'), P(jb, 'w'), { arrowEnd: 'none' });
  b.edge(P(jb, 'n'), P(xor, 'in1'), { arrowEnd: 'none' });
  b.edge(P(jb, 's'), P(and, 'in1'), { arrowEnd: 'none' });
  b.edge(P(xor, 'out'), P(s, 'w'), { labels: [lab('S = A ⊕ B', 0.5, { dy: -14, bg: false, color: 'vw-blue' })] });
  b.edge(P(and, 'out'), P(c, 'w'), { labels: [lab('C = A·B', 0.5, { dy: -14, bg: false, color: 'vw-blue' })] });
  b.group([ja, jb, xor, and], { outline: 'hull', padding: 22, stroke: 'vw-purple', label: { text: 'Half adder logic', pos: 'bottom', color: 'vw-purple', size: 14 } });
  void title;
  const doc = b.finish('Half adder');
  fs.writeFileSync(path.join(root, 'examples', 'logic-gates.json'), IO.toJSON(doc) + '\n');
}
console.log('ok');
