import { store } from './state-store.js';
import { ui } from './ui-controller.js';
import { sanitizeFilename } from './utils.js';

export class IOManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
      saveButton.addEventListener('click', () => this.saveState());
    }

    const loadMachineInput = document.getElementById('loadMachineInput');
    if (loadMachineInput) {
      loadMachineInput.addEventListener('change', (e) => this.handleFileLoad(e));
    }

    const loadButton = document.getElementById('loadButton');
    if (loadButton) {
      loadButton.addEventListener('change', (e) => this.handleFileLoad(e));
    }
    
    document.getElementById('saveImageTable')?.addEventListener('click', () => this.captureDefinitionTableImage());
    document.getElementById('saveImageDiagram')?.addEventListener('click', () => this.captureDiagramImage());
    document.getElementById('saveImageTransitionTable')?.addEventListener('click', () => this.captureTransitionTableImage());
    document.getElementById('saveImageKmaps')?.addEventListener('click', () => this.captureKmapImagesZip());
  }

  handleFileLoad(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        this.loadState(data);
      } catch (err) {
        console.error('Failed to parse JSON', err);
        alert('Invalid save file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }

  saveState() {
    const state = store.state;
    const payloadState = JSON.parse(JSON.stringify(state));
    
    if (payloadState.transitionTable) {
      payloadState.transitionTable = this.compressTransitionTable(state.transitionTable);
    }

    const payload = this.stringifyStateWithInlineArrays(payloadState);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    this.download(`${sanitizeFilename(state.name || 'fsm')}-save.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.clearDirty();
  }

  loadState(data) {
    if (data.transitionTable && data.transitionTable.data) {
      data.transitionTable = this.decompressTransitionTable(data.transitionTable);
    }
    store.update(data);
  }

  download(filename, content) {
    const link = document.createElement('a');
    link.href = content;
    link.download = filename;
    link.click();
  }

  compressTransitionTable(table) {
    if (!table) return { headers: [], data: [] };
    const headers = (table.columns || []).map((col) => col.key);
    const rows = table.rows || [];
    const cells = table.cells || {};

    const mapValue = (value) => {
      if (value === '0') return 0;
      if (value === '1') return 1;
      if (value === 'X') return 2;
      return -1;
    };

    const data = rows.map((row) =>
      headers.map((colKey) => mapValue(cells[`${row.key}::${colKey}`] ?? '')),
    );

    return { ...table, headers, data, cells: undefined };
  }

  decompressTransitionTable(compressedTable) {
    const { headers, data, rows } = compressedTable;
    if (!headers || !data || !rows) return compressedTable;

    const inverseMap = { '-1': '', 0: '0', 1: '1', 2: 'X' };
    const cells = {};
    
    rows.forEach((row, rowIdx) => {
      const rowValues = data[rowIdx] || [];
      headers.forEach((colKey, colIdx) => {
        cells[`${row.key}::${colKey}`] = inverseMap[rowValues[colIdx]] ?? '';
      });
    });

    const table = { ...compressedTable };
    delete table.data;
    delete table.headers;
    table.cells = cells;
    return table;
  }

  stringifyStateWithInlineArrays(payloadState) {
    const inlineMap = new Map();
    let placeholderId = 0;

    const addInline = (arr, formatter) => {
      const placeholder = `__INLINE_ARRAY_${placeholderId += 1}__`;
      inlineMap.set(`"${placeholder}"`, formatter(arr));
      return placeholder;
    };

    const replacer = (key, value) => {
      if (key === 'headers' && Array.isArray(value)) {
        return addInline(value, (arr) => `[ ${arr.map((v) => JSON.stringify(v)).join(', ')} ]`);
      }
      if (key === 'data' && Array.isArray(value)) {
        return value.map((row) =>
          (Array.isArray(row) ? addInline(row, (arr) => `[ ${arr.join(', ')} ]`) : row));
      }
      return value;
    };

    let json = JSON.stringify(payloadState, replacer, 2);
    inlineMap.forEach((formatted, token) => {
      json = json.replaceAll(token, formatted);
    });
    return json;
  }

  async captureDiagramImage() {
    const diagram = ui.elements.diagram;
    if (!diagram || typeof html2canvas === 'undefined') {
      alert('html2canvas library not loaded.');
      return;
    }
    const canvas = await html2canvas(diagram, { backgroundColor: '#ffffff' });
    this.download(`${sanitizeFilename(store.state.name)}-diagram.png`, canvas.toDataURL('image/png'));
  }

  async captureDefinitionTableImage() {
    const content = ui.elements.stateDefinitionContent || ui.elements.stateDefinitionDialog;
    if (!content || typeof html2canvas === 'undefined') return;
    const canvas = await html2canvas(content, { backgroundColor: '#ffffff' });
    this.download(`${sanitizeFilename(store.state.name)}-state-table.png`, canvas.toDataURL('image/png'));
  }

  async captureTransitionTableImage() {
    const drawer = ui.elements.transitionDrawer;
    if (!drawer || typeof html2canvas === 'undefined') return;
    const canvas = await html2canvas(drawer, { backgroundColor: '#ffffff' });
    this.download(`${sanitizeFilename(store.state.name)}-transition-table.png`, canvas.toDataURL('image/png'));
  }

  async captureKmapImagesZip() {
    if (!store.state.kmaps.length) return;
    if (typeof JSZip === 'undefined') {
      alert('JSZip library not loaded.');
      return;
    }
    const zip = new JSZip();
    const cards = document.querySelectorAll('.kmap-card');
    
    for (const card of cards) {
      const kmapId = card.dataset.kmapId;
      const kmap = store.state.kmaps.find(k => k.id == kmapId);
      const canvas = await html2canvas(card, { backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png').split(',')[1];
      zip.file(`${sanitizeFilename(kmap.label || 'kmap')}.png`, imgData, { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    this.download(`${sanitizeFilename(store.state.name)}-kmaps.zip`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const ioManager = new IOManager();
