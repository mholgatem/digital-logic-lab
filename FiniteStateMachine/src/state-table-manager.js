import { store } from './state-store.js';
import { ui } from './ui-controller.js';

export class StateTableManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
    store.subscribe(() => this.render());
  }

  setupEventListeners() {
    const tableBody = ui.elements.stateTableBody;
    if (tableBody) {
      tableBody.addEventListener('input', (e) => this.handleInput(e));
    }
    
    const stateDefinitionBtn = document.getElementById('stateDefinitionBtn');
    if (stateDefinitionBtn) {
      stateDefinitionBtn.addEventListener('click', () => {
        ui.openDialog('stateDefinitionDialog');
        this.render();
      });
    }
  }

  handleInput(e) {
    const target = e.target;
    const id = parseInt(target.dataset.id, 10);
    const field = target.dataset.field;
    const st = store.state.states.find((s) => s.id === id);
    if (!st) return;

    if (field === 'label') st.label = target.value;
    if (field === 'binary') st.binary = target.value;
    if (field === 'description') st.description = target.value;
    
    store.markDirty();
    // No full update call here to avoid re-rendering while typing
  }

  render() {
    const tableBody = ui.elements.stateTableBody;
    if (!tableBody) return;

    tableBody.innerHTML = '';
    store.state.states.forEach((st, index) => {
      const tr = document.createElement('tr');
      tr.dataset.id = st.id;
      tr.innerHTML = `
        <td>${index}</td>
        <td><input type="text" data-id="${st.id}" data-field="label" value="${st.label || ''}"></td>
        <td><input type="text" data-id="${st.id}" data-field="binary" value="${st.binary || ''}"></td>
        <td><input type="text" data-id="${st.id}" data-field="description" value="${st.description || ''}"></td>
      `;
      tableBody.appendChild(tr);
    });
  }
}

export const stateTableManager = new StateTableManager();
