import { store } from './state-store.js';
import { ui } from './ui-controller.js';
import { formatScriptedText } from './utils.js';

export class TransitionTableManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
    store.subscribe(() => this.render());
  }

  setupEventListeners() {
    const toggleBtn = document.getElementById('toggleTransitionDrawer');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleDrawer());
    }

    const verifyBtn = document.getElementById('verifyTransitionTable');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => this.verifyAgainstDiagram());
    }

    const closeBtn = document.getElementById('closeTransitionDrawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDrawer());
    }

    const dropzone = ui.elements.transitionColumnDropzone;
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('kmap-dialog-drop-hover');
      });
      
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('kmap-dialog-drop-hover');
      });
      
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('kmap-dialog-drop-hover');
        this.handleDrop(e);
      });
    }
  }

  handleDrop(e) {
    if (!this.dragState) return;
    const state = store.state;
    const columns = [...(state.transitionTable.columns || [])];
    
    if (this.dragState.source === 'tray') {
      const template = state.transitionTable.availableColumns.find(t => t.key === this.dragState.value);
      if (template) {
        // Create new column instance
        const newCol = { ...template, key: `${template.baseKey}__${Date.now()}` };
        columns.push(newCol);
      }
    } else if (this.dragState.source === 'selection') {
      // Logic for reordering could go here
    }
    
    store.update({
      transitionTable: { ...state.transitionTable, columns }
    });
    store.markDirty();
    this.dragState = null;
  }

  toggleDrawer() {
    const drawer = ui.elements.transitionDrawer;
    if (drawer) {
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    }
  }

  openDrawer() {
    const drawer = ui.elements.transitionDrawer;
    if (drawer) {
      drawer.classList.add('open');
      document.body.classList.add('drawer-open');
      this.render();
    }
  }

  closeDrawer() {
    const drawer = ui.elements.transitionDrawer;
    if (drawer) {
      drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
    }
  }

  ensureStructure() {
    const state = store.state;
    if (!state.transitionTable || typeof state.transitionTable !== 'object') {
      state.transitionTable = { cells: {}, columns: [], rows: [] };
    }
    
    const templates = this.buildTemplates();
    state.transitionTable.availableColumns = templates;

    if (!state.transitionTable.columns) state.transitionTable.columns = [];
    if (!state.transitionTable.rows || state.transitionTable.rows.length === 0) {
       this.rebuildRows();
    }
  }

  buildTemplates() {
    const state = store.state;
    const bitCount = this.stateBitCount();
    const templates = [];
    
    // Current state bits
    for (let i = bitCount - 1; i >= 0; i -= 1) {
      templates.push({ key: `q_${i}`, baseKey: `q_${i}`, label: `Q_${i}`, type: 'value' });
    }
    
    // Next state bits
    for (let i = bitCount - 1; i >= 0; i -= 1) {
      templates.push({
        key: `next_q_${i}`,
        baseKey: `next_q_${i}`,
        label: `Q_${i}^+`,
        type: 'value',
      });
    }
    
    // Inputs
    state.inputs.forEach((name, idx) => {
      templates.push({
        key: `in_${idx}`,
        baseKey: `in_${idx}`,
        label: name || `Input ${idx + 1}`,
        type: 'value',
      });
    });
    
    // Outputs
    state.outputs.forEach((name, idx) => {
      templates.push({
        key: `out_${idx}`,
        baseKey: `out_${idx}`,
        label: name || `Output ${idx + 1}`,
        type: 'value',
      });
    });
    
    templates.push({ key: 'spacer', baseKey: 'spacer', label: '', type: 'spacer', allowMultiple: true });
    return templates;
  }

  stateBitCount() {
    const state = store.state;
    return Math.max(1, Math.ceil(Math.log2(Math.max(state.numStates, 1))));
  }

  renderTransitionColumnTray() {
    const tray = ui.elements.transitionColumnTray;
    if (!tray) return;
    tray.innerHTML = '';
    const templates = store.state.transitionTable?.availableColumns || this.buildTemplates();
    
    templates.forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kmap-token transition-token';
      btn.draggable = true;
      btn.dataset.tokenType = tpl.type;
      btn.dataset.tokenValue = tpl.key;
      if (tpl.type === 'spacer') btn.classList.add('transition-spacer');
      btn.innerHTML = tpl.label ? formatScriptedText(tpl.label) : '&nbsp;';
      
      btn.addEventListener('dragstart', (e) => {
        this.dragState = { source: 'tray', type: tpl.type, value: tpl.key };
      });
      
      tray.appendChild(btn);
    });
  }

  renderTransitionColumnSelection() {
    const dropzone = ui.elements.transitionColumnDropzone;
    if (!dropzone) return;
    dropzone.innerHTML = '';
    const columns = store.state.transitionTable?.columns || [];
    
    if (!columns.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'kmap-expr-placeholder';
      placeholder.textContent = 'Drag columns here to build the table';
      dropzone.appendChild(placeholder);
      return;
    }
    
    columns.forEach((col, idx) => {
      dropzone.appendChild(this.renderTransitionColumnToken(col, idx));
    });
  }

  renderTransitionColumnToken(col, idx) {
    const el = document.createElement('div');
    el.className = 'transition-column-token kmap-expr-token';
    el.draggable = true;
    el.dataset.index = idx;
    
    const inner = document.createElement('div');
    inner.className = 'kmap-expr-token-inner';
    
    if (col.type === 'spacer') {
      el.classList.add('transition-spacer-token');
      inner.innerHTML = '&nbsp;';
    } else {
      inner.innerHTML = formatScriptedText(col.label || '');
    }
    
    el.appendChild(inner);
    
    el.addEventListener('dragstart', (e) => {
      this.dragState = { source: 'selection', fromIndex: idx };
    });
    
    return el;
  }

  render() {
    this.ensureStructure();
    this.renderTransitionColumnTray();
    this.renderTransitionColumnSelection();
    
    const head = ui.elements.transitionTableHead;
    const body = ui.elements.transitionTableBody;
    if (!head || !body) return;

    head.innerHTML = '';
    body.innerHTML = '';

    const state = store.state;
    const columns = [{ key: 'row_index', label: '#', type: 'rowIndex' }, ...(state.transitionTable.columns || [])];

    const headerRow = document.createElement('tr');
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.innerHTML = formatScriptedText(col.label || '');
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    state.transitionTable.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      columns.forEach((col) => {
        const td = document.createElement('td');
        if (col.type === 'rowIndex') {
          td.textContent = rowIdx + 1;
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = state.transitionTable.cells[`${row.key}::${col.key}`] || '';
          input.addEventListener('change', (e) => {
            state.transitionTable.cells[`${row.key}::${col.key}`] = e.target.value;
            store.markDirty();
          });
          td.appendChild(input);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  verifyAgainstDiagram(options = {}) {
    const state = store.state;
    const diagramDict = this.buildDiagramDictionary();
    const tableDict = this.buildTableDictionary();
    
    const allKeys = new Set([...diagramDict.keys(), ...tableDict.keys()]);
    let matches = 0;
    let missingInTable = 0;
    
    allKeys.forEach((key) => {
      const expected = diagramDict.get(key);
      const actual = tableDict.get(key);
      
      if (expected && actual) {
        const identical = expected.every((val, idx) => val === actual[idx]);
        if (identical) matches += 1;
      } else if (expected && !actual) {
        missingInTable += 1;
      }
    });

    const total = allKeys.size || 1;
    const matchPercent = Math.round((matches / total) * 100);
    const passed = matchPercent === 100 && missingInTable === 0;
    
    let reason = undefined;
    if (!passed) {
      if (missingInTable > 0) reason = 'Table is missing transitions from diagram';
      else reason = 'Table entries do not match diagram transitions';
    }

    this.setVerificationStatus(passed, reason, matchPercent);
  }

  buildDiagramDictionary() {
    const state = store.state;
    const bitCount = this.stateBitCount();
    const dict = new Map();

    state.transitions.forEach((tr) => {
      const sourceBits = state.states.find(s => s.id === tr.from)?.binary;
      const nextBits = state.states.find(s => s.id === tr.to)?.binary;
      if (!sourceBits || !nextBits) return;

      // This is a simplified version of the logic in app.js
      // In a real implementation, we'd expand 'X' in inputs to all combinations
      const key = `${sourceBits}|${tr.inputValues.join('')}`;
      const value = [...nextBits.split(''), ...(tr.outputValues || [])];
      dict.set(key, value);
    });

    return dict;
  }

  buildTableDictionary() {
    const state = store.state;
    const dict = new Map();
    // Logic to read cells and build a dictionary matching the diagram format
    return dict; 
  }

  setVerificationStatus(passed, message, percent) {
    const verifyBtn = document.getElementById('verifyTransitionTable');
    if (!verifyBtn) return;

    verifyBtn.classList.remove('passed', 'failed');
    if (passed) {
      verifyBtn.classList.add('passed');
      verifyBtn.title = 'Table matches diagram!';
    } else {
      verifyBtn.classList.add('failed');
      verifyBtn.title = message || `Table does not match diagram (${percent}%)`;
    }
  }
}

export const transitionTableManager = new TransitionTableManager();
