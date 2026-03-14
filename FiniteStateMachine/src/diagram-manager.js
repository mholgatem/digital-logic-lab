import { store } from './state-store.js';
import { ui } from './ui-controller.js';

export class DiagramManager {
  constructor() {
    this.diagram = ui.elements.diagram;
    this.viewport = ui.elements.viewport;
    this.viewState = { scale: 1, panX: 0, panY: 0 };
    this.selectedStateId = null;
    this.selectedArrowId = null;
    this.currentArrow = null;
    this.previewPath = null;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.dragData = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();
    store.subscribe(() => this.render());
  }
setupEventListeners() {
  this.diagram.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  this.diagram.addEventListener('mousedown', (e) => this.handleMouseDown(e));
  document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
  document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

  if (ui.elements.paletteList) {
    ui.elements.paletteList.addEventListener('dragstart', (e) => this.handlePaletteDragStart(e));
  }

  this.diagram.addEventListener('dragover', (e) => e.preventDefault());
  this.diagram.addEventListener('drop', (e) => this.handleDrop(e));
}

handlePaletteDragStart(e) {
  const id = e.target.closest('.palette-item')?.dataset.id;
  if (!id) return;
  e.dataTransfer.setData('text/plain', id);
}

renderPalette() {
  const paletteList = ui.elements.paletteList;
  if (!paletteList) return;
  paletteList.innerHTML = '';
  const template = document.getElementById('paletteItemTemplate');
  if (!template) return;

  const unplaced = store.state.states.filter((s) => !s.placed);
  unplaced.forEach((st) => {
    const node = template.content.cloneNode(true).querySelector('.palette-item');
    node.dataset.id = st.id;
    const decimalValue = this.stateBinaryDecimal(st);
    node.querySelector('.state-circle').textContent = decimalValue ?? st.id;
    node.querySelector('.state-label').textContent = st.label;
    paletteList.appendChild(node);
  });
}

render() {
  this.clear();
  this.renderPalette();
  const state = store.state;

    const point = this.getSVGPoint(e.clientX, e.clientY);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const zoomIntensity = 0.0015;
    const factor = Math.exp(-delta * zoomIntensity);
    const newScale = Math.min(3, Math.max(0.4, this.viewState.scale * factor));
    const scaleFactor = newScale / this.viewState.scale;
    
    this.viewState.panX = point.x - (point.x - this.viewState.panX) * scaleFactor;
    this.viewState.panY = point.y - (point.y - this.viewState.panY) * scaleFactor;
    this.viewState.scale = newScale;
    this.applyTransform();
  }

  handleMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    const targetState = e.target.closest('circle.state-node');
    const targetHandle = e.target.closest('circle.arc-handle');
    const targetPath = e.target.closest('path.arrow-path');
    const targetLabelHandle = e.target.closest('.label-handle');

    if (!targetState && !targetHandle && !targetPath && !targetLabelHandle) {
      this.selectedStateId = null;
      this.selectedArrowId = null;
      this.render();
    }

    if (targetState) {
      const id = parseInt(targetState.parentNode.dataset.id, 10);
      this.selectedStateId = id;
      this.selectedArrowId = null;
      
      const st = store.state.states.find(s => s.id === id);
      if (st) {
        const startPoint = this.getSVGPoint(e.clientX, e.clientY);
        const startArrowWithAlt = e.button === 0 && e.altKey;
        const startArrowWithRight = e.button === 2;

        if (startArrowWithAlt || startArrowWithRight) {
          this.currentArrow = {
            from: id,
            targetId: null,
            toPoint: startPoint,
            arcOffset: 0,
            startButton: e.button,
            startWithAlt: startArrowWithAlt
          };
          this.render();
          return;
        }

        this.dragData = {
          type: 'state',
          id: id,
          startTime: Date.now(),
          startX: st.x,
          startY: st.y,
          mouseStartX: e.clientX,
          mouseStartY: e.clientY,
          isResize: e.ctrlKey,
          startRadius: st.radius
        };
      }
      this.render();
    }

    if (targetHandle) {
      const id = parseInt(targetHandle.dataset.id, 10);
      this.selectedArrowId = id;
      this.selectedStateId = null;
      this.dragData = { type: 'arrowHandle', id };
      this.render();
    }

    if (targetLabelHandle) {
      const id = parseInt(targetLabelHandle.dataset.id, 10);
      this.selectedArrowId = id;
      this.selectedStateId = null;
      this.dragData = { type: 'labelHandle', id };
      this.render();
    }
  }

  handleMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.viewState.panX += dx;
      this.viewState.panY += dy;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.applyTransform();
      return;
    }

    const pt = this.getSVGPoint(e.clientX, e.clientY);

    if (this.currentArrow) {
      const hoveredState = this.findStateAtPoint(pt);
      if (hoveredState) {
        this.currentArrow.targetId = hoveredState.id;
        const fromState = store.state.states.find(s => s.id === this.currentArrow.from);
        if (fromState) {
          this.currentArrow.toPoint = this.limitArrowPointOnTarget(fromState, hoveredState, pt);
        }
      } else {
        this.currentArrow.targetId = null;
        this.currentArrow.toPoint = pt;
      }
      this.render();
      return;
    }

    if (!this.dragData) return;

    if (this.dragData.type === 'state') {
      const st = store.state.states.find(s => s.id === this.dragData.id);
      if (st) {
        if (this.dragData.isResize) {
          const dx = pt.x - st.x;
          const dy = pt.y - st.y;
          st.radius = Math.max(20, Math.hypot(dx, dy));
        } else {
          const startPt = this.getSVGPoint(this.dragData.mouseStartX, this.dragData.mouseStartY);
          st.x = this.dragData.startX + (pt.x - startPt.x);
          st.y = this.dragData.startY + (pt.y - startPt.y);
        }
        this.render();
        store.markDirty();
      }
    } else if (this.dragData.type === 'arrowHandle') {
      const tr = store.state.transitions.find(t => t.id === this.dragData.id);
      if (tr) {
        const from = store.state.states.find(s => s.id === tr.from);
        const to = store.state.states.find(s => s.id === tr.to);
        if (from && to) {
          if (from.id === to.id) {
            tr.loopAngle = Math.atan2(pt.y - from.y, pt.x - from.x);
            tr.arcOffset = Math.max(0, Math.hypot(pt.x - from.x, pt.y - from.y) - from.radius);
          } else {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            tr.arcOffset = (pt.x - midX) * nx + (pt.y - midY) * ny;
          }
          this.render();
          store.markDirty();
        }
      }
    } else if (this.dragData.type === 'labelHandle') {
      const tr = store.state.transitions.find(t => t.id === this.dragData.id);
      if (tr) {
        const pathEl = this.diagram.querySelector(`path.arrow-path[data-id="${tr.id}"]`);
        if (pathEl) {
          tr.labelT = this.nearestTOnPath(pathEl, pt);
          this.render();
          store.markDirty();
        }
      }
    }
  }

  handleMouseUp(e) {
    if (this.currentArrow && this.currentArrow.targetId !== null) {
      const from = this.currentArrow.from;
      const to = this.currentArrow.targetId;
      const newId = Date.now();
      const newTransition = {
        id: newId,
        from,
        to,
        inputValues: Array(store.state.inputs.length).fill('X'),
        outputValues: store.state.type === 'mealy' ? Array(store.state.outputs.length).fill('X') : [],
        arcOffset: 0,
        labelT: 0.12,
      };
      const transitions = [...store.state.transitions, newTransition];
      store.update({ transitions });
      this.selectedArrowId = newId;
      store.markDirty();
    }

    this.isPanning = false;
    this.dragData = null;
    this.currentArrow = null;
    this.render();
  }

  getSVGPoint(clientX, clientY) {
    const pt = this.diagram.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this.viewport.getScreenCTM().inverse());
  }

  nearestTOnPath(pathEl, pt) {
    const len = pathEl.getTotalLength();
    let bestT = 0.5;
    let minDict = Infinity;
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = pathEl.getPointAtLength(t * len);
      const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (dist < minDict) {
        minDict = dist;
        bestT = t;
      }
    }
    return bestT;
  }

  findStateAtPoint(pt) {
    return store.state.states.find((st) => {
      if (!st.placed) return false;
      const dist = Math.hypot(pt.x - st.x, pt.y - st.y);
      return dist <= st.radius;
    });
  }

  limitArrowPointOnTarget(fromState, targetState, cursorPoint) {
    const dir = { x: cursorPoint.x - fromState.x, y: cursorPoint.y - fromState.y };
    const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
    const centersDistance = Math.hypot(targetState.x - fromState.x, targetState.y - fromState.y);
    const maxLen = Math.max(0, centersDistance);
    const clampedLen = Math.min(dirLen, maxLen);
    let projected = {
      x: fromState.x + (dir.x / dirLen) * clampedLen,
      y: fromState.y + (dir.y / dirLen) * clampedLen,
    };
    const toTarget = { x: projected.x - targetState.x, y: projected.y - targetState.y };
    const toTargetLen = Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y) || 1;
    if (toTargetLen < targetState.radius) {
      const scale = targetState.radius / toTargetLen;
      projected = {
        x: targetState.x + toTarget.x * scale,
        y: targetState.y + toTarget.y * scale,
      };
    }
    return { ...projected, radius: 0 };
  }

  applyTransform() {
    if (this.viewport) {
      this.viewport.setAttribute(
        'transform',
        `translate(${this.viewState.panX}, ${this.viewState.panY}) scale(${this.viewState.scale})`
      );
    }
  }

  handleDrop(e) {
    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const st = store.state.states.find((s) => s.id === id);
    if (!st) return;
    const pt = this.getSVGPoint(e.clientX, e.clientY);
    st.x = pt.x;
    st.y = pt.y;
    st.placed = true;
    if (!st.hasBeenPlaced) {
      st.radius *= 1.5;
      st.hasBeenPlaced = true;
    }
    store.markDirty();
    this.render();
  }

  clear() {
    if (this.viewport) {
      this.viewport.innerHTML = '';
    }
  }

  render() {
    this.clear();
    const state = store.state;
    
    state.transitions.forEach((tr) => this.drawTransition(tr));
    state.states
      .filter((s) => s.placed)
      .forEach((st) => this.drawState(st));
    
    this.drawPreview();
  }

  drawState(st) {
    const state = store.state;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('state-group');
    group.dataset.id = st.id;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', st.x);
    circle.setAttribute('cy', st.y);
    circle.setAttribute('r', st.radius);
    circle.classList.add('state-node');
    if (this.selectedStateId === st.id) {
      circle.classList.add('selected');
    }

    const coverage = this.evaluateCoverage(st.id);
    if (coverage.overfull) {
      circle.classList.add('overfull');
    } else if (coverage.missing) {
      circle.classList.add('missing');
    }

    const decimalValue = this.stateBinaryDecimal(st);
    const decimalText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    decimalText.setAttribute('x', st.x);
    decimalText.setAttribute('y', st.y + st.radius * 0.07);
    decimalText.setAttribute('text-anchor', 'middle');
    decimalText.setAttribute('dominant-baseline', 'middle');
    decimalText.setAttribute('font-size', st.radius * 1.7);
    decimalText.classList.add('state-decimal-text');
    decimalText.textContent = decimalValue ?? '';

    const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textLabel.setAttribute('x', st.x);
    textLabel.setAttribute('y', st.y - 6);
    textLabel.setAttribute('text-anchor', 'middle');
    textLabel.classList.add('state-label-text');
    textLabel.textContent = st.label || `S${st.id}`;

    const textId = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textId.setAttribute('x', st.x);
    textId.setAttribute('y', st.y + 22);
    textId.setAttribute('text-anchor', 'middle');
    if (state.type === 'moore') {
      textId.innerHTML = this.buildIOText(state.outputs, st.outputs, state.showBinary ? 'binary' : 'vars');
    }

    group.appendChild(circle);
    group.appendChild(decimalText);
    group.appendChild(textLabel);
    if (state.type === 'moore') {
      group.appendChild(textId);
    }
    this.viewport.appendChild(group);
  }

  drawTransition(tr) {
    const state = store.state;
    this.normalizeTransition(tr);
    const from = state.states.find((s) => s.id === tr.from);
    const to = state.states.find((s) => s.id === tr.to);
    if (!from || !to) return;

    const isSelfLoop = from.id === to.id;
    const pathInfo = isSelfLoop ? this.selfLoopPath(from, tr) : this.quadraticPath(from, to, tr.arcOffset || 0);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathInfo.d);
    path.classList.add('arrow-path');
    if (isSelfLoop) path.classList.add('self-loop');
    if (this.selectedArrowId === tr.id) path.classList.add('selected');
    path.dataset.id = tr.id;

    this.viewport.appendChild(path);

    const totalLength = path.getTotalLength();
    const midPoint = path.getPointAtLength(totalLength / 2);
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.classList.add('arc-handle');
    handle.setAttribute('r', 7);
    handle.setAttribute('cx', midPoint.x);
    handle.setAttribute('cy', midPoint.y);
    handle.dataset.id = tr.id;

    const clampedT = Math.min(0.95, Math.max(0.05, tr.labelT || 0.5));
    tr.labelT = clampedT;
    const labelPoint = path.getPointAtLength(totalLength * clampedT);
    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.classList.add('label-handle');
    labelGroup.dataset.id = tr.id;
    labelGroup.setAttribute('transform', `translate(${labelPoint.x} ${labelPoint.y})`);

    const { labelHtml } = this.transitionLabel(tr);
    const labelPlain = tr.inputs || '';
    const labelWidth = Math.max(46, (labelPlain.length || 4) * 7 + 12);

    const labelRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    labelRect.setAttribute('x', -labelWidth / 2);
    labelRect.setAttribute('y', -16);
    labelRect.setAttribute('width', labelWidth);
    labelRect.setAttribute('height', 24);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('y', 2);
    label.innerHTML = labelHtml;

    labelGroup.appendChild(labelRect);
    labelGroup.appendChild(label);

    this.viewport.appendChild(handle);
    this.viewport.appendChild(labelGroup);
  }

  drawPreview() {
    const state = store.state;
    if (!this.currentArrow || !this.currentArrow.toPoint) return;
    const from = state.states.find((s) => s.id === this.currentArrow.from);
    if (!from) return;
    const isSelfPreview = this.currentArrow.targetId === from.id;
    const to = {
      x: this.currentArrow.toPoint.x,
      y: this.currentArrow.toPoint.y,
      radius: this.currentArrow.toPoint.radius || 0,
    };
    const pathInfo = isSelfPreview
      ? this.selfLoopPath(from, { loopAngle: this.currentArrow.loopAngle ?? -Math.PI / 2, arcOffset: 30 })
      : this.quadraticPath(from, to, this.currentArrow.arcOffset || 0);
    
    if (!this.previewPath) {
      this.previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.previewPath.classList.add('arrow-path');
      this.previewPath.setAttribute('stroke-dasharray', '6 4');
    }
    this.previewPath.classList.toggle('self-loop', isSelfPreview);
    this.previewPath.setAttribute('d', pathInfo.d);
    this.viewport.appendChild(this.previewPath);
  }

  // Helper methods
  evaluateCoverage(stateId) {
    const state = store.state;
    const expected = Math.pow(2, state.inputs.length || 0);
    if (!expected) return { missing: false, overfull: false };

    const comboCounts = new Map();
    state.transitions
      .filter((t) => t.from === stateId)
      .forEach((tr) => {
        this.normalizeTransition(tr);
        this.combinationsFromValues(tr.inputValues).forEach((combo) => {
          comboCounts.set(combo, (comboCounts.get(combo) || 0) + 1);
        });
      });

    const uniqueCombos = comboCounts.size;
    const hasDuplicates = Array.from(comboCounts.values()).some((count) => count > 1);
    const missing = uniqueCombos < expected;
    const overfull = hasDuplicates || uniqueCombos > expected;
    return { missing, overfull };
  }

  combinationsFromValues(values) {
    let combos = [''];
    values.forEach((val) => {
      const next = [];
      const normalized = val === '0' || val === '1' ? val : 'X';
      combos.forEach((prefix) => {
        if (normalized === 'X') {
          next.push(`${prefix}0`, `${prefix}1`);
        } else {
          next.push(`${prefix}${normalized}`);
        }
      });
      combos = next;
    });
    return combos;
  }

  normalizeTransition(tr) {
    if (!tr.inputValues) tr.inputValues = [];
    const state = store.state;
    while (tr.inputValues.length < state.inputs.length) tr.inputValues.push('X');
    if (state.type === 'mealy' && !tr.outputValues) {
       tr.outputValues = Array(state.outputs.length).fill('X');
    }
  }

  stateBinaryDecimal(st) {
    const binary = this.stateBinaryCode(st, this.stateBitCount());
    if (!binary || binary.includes('X')) return null;
    return parseInt(binary, 2);
  }

  stateBinaryCode(st, bitCount) {
    let b = (st.binary || '').toString().replace(/[^01X]/g, '');
    if (!b) return '';
    return b.padStart(bitCount, '0').slice(-bitCount);
  }

  stateBitCount() {
    const state = store.state;
    const n = Math.max(2, state.numStates || 0);
    return Math.ceil(Math.log2(n));
  }

  buildIOText(names, values, mode) {
    if (!names.length) return '';
    const parts = names.map((name, i) => {
      const val = values[i] || '0';
      return mode === 'vars' ? `${name}=${val}` : val;
    });
    return parts.join(mode === 'vars' ? ', ' : '');
  }

  transitionLabel(tr) {
    const state = store.state;
    let html = tr.inputs || '';
    if (state.type === 'mealy' && tr.outputs) {
      html += ` / ${tr.outputs}`;
    }
    return { labelHtml: html };
  }

  quadraticPath(from, to, arcOffset = 0) {
    const { start, end, len, dx, dy } = this.endpointsForArc(from, to, arcOffset);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = midX + nx * arcOffset;
    const cy = midY + ny * arcOffset;
    return { d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`, ctrl: { x: cx, y: cy } };
  }

  endpointsForArc(from, to, arcOffset = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const maxShift = (2 * Math.PI) / 3;
    const normalized = Math.max(-1, Math.min(1, arcOffset / (len / 2 || 1)));
    const angleShift = normalized * maxShift;

    const startAngle = baseAngle + angleShift;
    const endAngle = baseAngle + Math.PI - angleShift;

    const start = {
      x: from.x + Math.cos(startAngle) * from.radius,
      y: from.y + Math.sin(startAngle) * from.radius,
    };
    const end = {
      x: to.x + Math.cos(endAngle) * to.radius,
      y: to.y + Math.sin(endAngle) * to.radius,
    };
    const chordDx = end.x - start.x;
    const chordDy = end.y - start.y;
    const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy) || 1;
    return { start, end, len: chordLen, dx: chordDx, dy: chordDy };
  }

  selfLoopPath(node, tr) {
    const angle = tr.loopAngle !== undefined ? tr.loopAngle : -Math.PI / 2;
    const sweep = Math.PI / 1.8;
    const startAngle = angle - sweep / 2;
    const endAngle = angle + sweep / 2;
    const loopDepth = Math.min(120, Math.max(30, (tr.arcOffset || 0) + 40));
    const ctrlRadius = loopDepth + 24;

    const start = {
      x: node.x + Math.cos(startAngle) * node.radius,
      y: node.y + Math.sin(startAngle) * node.radius,
    };
    const end = {
      x: node.x + Math.cos(endAngle) * node.radius,
      y: node.y + Math.sin(endAngle) * node.radius,
    };
    const ctrl = {
      x: node.x + Math.cos(angle) * (node.radius + ctrlRadius),
      y: node.y + Math.sin(angle) * (node.radius + ctrlRadius),
    };

    return { d: `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`, ctrl };
  }
}

export const diagramManager = new DiagramManager();
