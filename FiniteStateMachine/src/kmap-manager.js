import { store } from './state-store.js';
import { ui } from './ui-controller.js';
import { formatScriptedText } from './utils.js';

export class KMapManager {
  constructor() {
    this.kmapWindow = ui.elements.kmapWindow;
    this.kmapList = ui.elements.kmapList;
    this.kmapEmptyState = ui.elements.kmapEmptyState;
    this.showKmapCircles = true;

    this.init();
  }

  init() {
    this.setupEventListeners();
    store.subscribe(() => this.render());
  }

  setupEventListeners() {
    if (ui.elements.kmapToggleBtn) {
      ui.elements.kmapToggleBtn.addEventListener('click', () => {
        ui.openDialog('kmapWindow');
        this.render();
      });
    }

    if (ui.elements.kmapCircleToggle) {
      ui.elements.kmapCircleToggle.addEventListener('click', () => {
        this.showKmapCircles = !this.showKmapCircles;
        this.syncKmapCircleToggleLabel();
        this.renderKmapCircles();
      });
    }

    const newKmapBtn = document.getElementById('newKmapBtn');
    if (newKmapBtn) {
      newKmapBtn.addEventListener('click', () => {
        ui.openDialog('kmapCreateDialog');
      });
    }
  }

  syncKmapCircleToggleLabel() {
    if (ui.elements.kmapCircleToggle) {
      ui.elements.kmapCircleToggle.textContent = this.showKmapCircles ? 'Hide Circles' : 'Show Circles';
    }
  }

  grayCode(bits) {
    if (bits <= 0) return [''];
    let codes = ['0', '1'];
    for (let i = 1; i < bits; i += 1) {
      const reflected = [...codes].reverse();
      codes = codes.map((c) => `0${c}`).concat(reflected.map((c) => `1${c}`));
    }
    return codes;
  }

  buildLayout(kmap) {
    const variables = kmap.variables || [];
    const mapVarCount = Math.max(0, variables.length - 4);
    const mapVars = variables.slice(0, mapVarCount);
    const coreVars = variables.slice(mapVarCount);
    const moreSigCount = Math.ceil(coreVars.length / 2);
    let moreSig = coreVars.slice(0, moreSigCount);
    let lessSig = coreVars.slice(moreSigCount);

    if (lessSig.length === 0 && moreSig.length > 1) {
      lessSig = [moreSig.pop()];
    }

    let rowVars, colVars;
    if (kmap.direction === 'vertical') {
      rowVars = moreSig;
      colVars = lessSig;
    } else {
      rowVars = lessSig;
      colVars = moreSig;
    }
    if (rowVars.length === 0 && colVars.length) {
      rowVars = [colVars.shift()];
    }

    const rowCodes = this.grayCode(rowVars.length);
    const colCodes = this.grayCode(colVars.length);
    const baseRows = rowCodes.length || 1;
    const baseCols = colCodes.length || 1;

    let mapRows = 1;
    let mapCols = 1;
    let mapRowCodes = [''];
    let mapColCodes = [''];

    if (mapVarCount === 1) {
      mapCols = 2;
      mapColCodes = this.grayCode(1);
    } else if (mapVarCount >= 2) {
      mapRows = 2;
      mapCols = 2;
      mapRowCodes = this.grayCode(1);
      mapColCodes = this.grayCode(1);
    }

    const submaps = [];
    for (let mr = 0; mr < mapRows; mr += 1) {
      for (let mc = 0; mc < mapCols; mc += 1) {
        const mapCode = `${mapRowCodes[mr] || ''}${mapColCodes[mc] || ''}`;
        const assignments = mapVars.map((name, idx) => `${name}=${mapCode[idx] || '0'}`);
        submaps.push({
          mapRow: mr,
          mapCol: mc,
          label: assignments.join(', '),
          rowOffset: mr * baseRows,
          colOffset: mc * baseCols,
        });
      }
    }

    return {
      rowVars,
      colVars,
      rowCodes,
      colCodes,
      mapVars,
      mapRowCodes,
      mapColCodes,
      submaps,
      baseRows,
      baseCols,
      mapRows,
      mapCols,
      totalRows: mapRows * baseRows,
      totalCols: mapCols * baseCols,
    };
  }

  buildCornerLabel(layout) {
    const corner = document.createElement('div');
    corner.className = 'kmap-corner-label';
    const diagonal = document.createElement('div');
    diagonal.className = 'kmap-diagonal';
    corner.appendChild(diagonal);

    const buildBlock = (vars, blockClass) => {
      const block = document.createElement('div');
      block.className = `kmap-variable-block ${blockClass}`;
      const list = vars.length ? vars : ['—'];
      list.forEach((name, idx) => {
        const span = document.createElement('span');
        const positionClass = idx === 0 ? 'kmap-var-top' : idx === 1 ? 'kmap-var-bottom' : '';
        span.className = `kmap-var ${positionClass}`.trim();
        span.innerHTML = formatScriptedText(name);
        block.appendChild(span);
      });
      return block;
    };

    corner.appendChild(buildBlock(layout.rowVars, 'kmap-vars-row'));
    corner.appendChild(buildBlock(layout.colVars, 'kmap-vars-col'));
    return corner;
  }

  buildTable(kmap, layout, submap) {
    const table = document.createElement('table');
    table.className = 'kmap-table';

    const headerRow = document.createElement('tr');
    const cornerCell = document.createElement('th');
    cornerCell.appendChild(this.buildCornerLabel(layout));
    headerRow.appendChild(cornerCell);

    layout.colCodes.forEach((code) => {
      const th = document.createElement('th');
      const span = document.createElement('span');
      span.className = 'kmap-gray-code kmap-gray-col';
      span.textContent = code || '0';
      th.appendChild(span);
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    layout.rowCodes.forEach((rowCode, rIdx) => {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      const span = document.createElement('span');
      span.className = 'kmap-gray-code kmap-gray-row';
      span.textContent = rowCode || '0';
      rowHeader.appendChild(span);
      tr.appendChild(rowHeader);

      layout.colCodes.forEach((colCode, cIdx) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        const rowIndex = submap.rowOffset + rIdx;
        const colIndex = submap.colOffset + cIdx;
        const key = `${rowIndex},${colIndex}`;
        input.dataset.kmapId = kmap.id;
        input.classList.add('kmap-cell-input');
        input.value = (kmap.cells && kmap.cells[key]) || '';

        input.addEventListener('change', (e) => {
          let val = (e.target.value || '').toUpperCase().replace(/[^01X]/g, '');
          if (val.length > 1) val = val[0];
          e.target.value = val;
          if (!kmap.cells) kmap.cells = {};
          kmap.cells[key] = val;
          store.markDirty();
        });

        td.appendChild(input);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    return table;
  }

  render() {
    if (!this.kmapList) return;
    this.kmapList.innerHTML = '';
    const hasKmaps = (store.state.kmaps || []).length > 0;
    this.kmapEmptyState.classList.toggle('hidden', hasKmaps);

    store.state.kmaps.forEach((kmap) => {
      this.renderKmapCard(kmap);
    });

    this.renderKmapCircles();
  }

  handleDrop(e) {
    // Logic for K-map creation from dialog drop
  }

  createKmapFromDialog() {
    const label = ui.elements.kmapLabelDropzone?.textContent || 'New K-map';
    const variables = Array.from(ui.elements.kmapVariablesDropzone?.querySelectorAll('.kmap-dialog-token') || [])
      .map(el => el.dataset.tokenValue);

    const newKmap = {
      id: Date.now(),
      label,
      variables,
      type: ui.elements.kmapTypeInput.value,
      direction: ui.elements.kmapDirectionInput.value,
      cells: {},
      expression: '',
      expressionTokens: []
    };

    const kmaps = [...store.state.kmaps, newKmap];
    store.update({ kmaps });
    ui.closeDialog('kmapCreateDialog');
    store.markDirty();
  }

  renderKmapCard(kmap) {
    const card = document.createElement('div');
    card.className = 'kmap-card';
    card.dataset.kmapId = kmap.id;
    const layout = this.buildLayout(kmap);

    const heading = document.createElement('span');
    heading.className = 'kmap-title';
    heading.innerHTML = formatScriptedText(kmap.label || 'K-map');
    card.appendChild(heading);

    const meta = document.createElement('div');
    meta.className = 'kmap-meta';
    meta.innerHTML = `
      <span><strong>Type:</strong> ${kmap.type?.toUpperCase() || 'SOP'}</span>
      <span><strong>Direction:</strong> ${kmap.direction === 'vertical' ? 'Vertical' : 'Horizontal'}</span>
    `;
    card.appendChild(meta);

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'kmap-grid-wrapper';
    const gridCollection = document.createElement('div');
    gridCollection.className = 'kmap-grid-collection';
    gridCollection.style.gridTemplateColumns = `repeat(${layout.mapCols}, 1fr)`;

    layout.submaps.forEach((sub) => {
      const submap = document.createElement('div');
      submap.className = 'kmap-submap';
      const label = document.createElement('div');
      label.className = 'kmap-submap-label';
      label.innerHTML = sub.label ? formatScriptedText(sub.label) : '&nbsp;';
      submap.appendChild(label);
      submap.appendChild(this.buildTable(kmap, layout, sub));
      gridCollection.appendChild(submap);
    });

    gridWrapper.appendChild(gridCollection);
    card.appendChild(gridWrapper);

    // Expression Building
    const expressionArea = document.createElement('div');
    expressionArea.className = 'kmap-expression';

    const label = document.createElement('span');
    label.className = 'kmap-expression-label';
    label.innerHTML = `${formatScriptedText(kmap.label || 'K-map')} =`;
    expressionArea.appendChild(label);

    const tray = document.createElement('div');
    tray.className = 'kmap-expression-tray';
    tray.tabIndex = 0;
    tray.dataset.kmapId = kmap.id;

    if (kmap.expressionTokens && kmap.expressionTokens.length > 0) {
      kmap.expressionTokens.forEach((token, idx) => {
        const tokenEl = this.renderExpressionToken(token, idx, kmap);
        tray.appendChild(tokenEl);
      });
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'kmap-expr-placeholder';
      placeholder.textContent = 'Drag tokens here to build expression';
      tray.appendChild(placeholder);
    }

    expressionArea.appendChild(tray);

    const actions = document.createElement('div');
    actions.className = 'kmap-card-actions';
    const verifyBtn = document.createElement('button');
    verifyBtn.textContent = 'Verify';
    verifyBtn.className = 'ghost';
    verifyBtn.addEventListener('click', () => this.verifyExpression(kmap));
    actions.appendChild(verifyBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'ghost danger';
    deleteBtn.addEventListener('click', () => this.deleteKmap(kmap.id));
    actions.appendChild(deleteBtn);

    card.appendChild(expressionArea);
    card.appendChild(actions);
    this.kmapList.appendChild(card);
  }

  renderExpressionToken(token, idx, kmap) {
    const el = document.createElement('div');
    el.className = 'kmap-expr-token';
    el.dataset.index = idx;

    const inner = document.createElement('div');
    inner.className = 'kmap-expr-token-inner';

    if (token.type === 'var') {
      inner.innerHTML = formatScriptedText(token.name);
      if (token.negated) el.classList.add('negated');
    } else if (token.type === 'operator') {
      inner.textContent = kmap.type === 'pos' ? '+' : '•';
    } else if (token.type === 'paren') {
      inner.textContent = token.value;
    }

    el.appendChild(inner);
    return el;
  }

  verifyExpression(kmap) {
    console.log(`Verifying ${kmap.type} expression for ${kmap.label}`);
  }

  deleteKmap(id) {
    const kmaps = store.state.kmaps.filter(k => k.id !== id);
    store.update({ kmaps });
    store.markDirty();
  }

  renderKmapCircles() {
    // K-map circle rendering logic
  }
}

export const kmapManager = new KMapManager();
