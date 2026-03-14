import { store } from './state-store.js';

const allowedStateCounts = [1, 2, 4, 8, 16, 32];

export class UIController {
  constructor() {
    this.elements = this.getElements();
    this.init();
  }

  init() {
    this.populateStateCountSelectors();
    this.initDialogs();
  }

  getElements() {
    return {
      landing: document.getElementById('landing'),
      newMachineDialog: document.getElementById('newMachineDialog'),
      arrowDialog: document.getElementById('arrowDialog'),
      quickRefDialog: document.getElementById('quickRefDialog'),
      diagram: document.getElementById('diagram'),
      viewport: document.getElementById('viewport'),
      paletteList: document.getElementById('paletteList'),
      palettePane: document.querySelector('.state-palette'),
      workspace: document.querySelector('.workspace'),
      stateTableBody: document.querySelector('#stateTable tbody'),
      toggleIoModeBtn: document.getElementById('toggleIoMode'),
      kmapToggleBtn: document.getElementById('kmapToggle'),
      stateDefinitionDialog: document.getElementById('stateDefinitionDialog'),
      stateDefinitionContent: document.getElementById('stateDefinitionContent'),
      stateDefinitionWindow: document.getElementById('stateDefinitionDialog')?.querySelector('.state-definition-dialog'),
      stateDefinitionHeader: document.getElementById('stateDefinitionHeader'),
      stateDefinitionResizeHandle: document.getElementById('stateDefinitionResizeHandle'),
      toolbarTitle: document.getElementById('toolbarTitle'),
      mealyOutputRow: document.getElementById('mealyOutputRow'),
      inputChoices: document.getElementById('inputChoices'),
      outputChoices: document.getElementById('outputChoices'),
      transitionDrawer: document.getElementById('transitionDrawer'),
      transitionTableHead: document.getElementById('transitionTableHead'),
      transitionTableBody: document.getElementById('transitionTableBody'),
      transitionColumnTray: document.getElementById('transitionColumnTray'),
      transitionColumnDropzone: document.getElementById('transitionColumnDropzone'),
      transitionTableHelpBtn: document.getElementById('transitionTableHelp'),
      transitionTableHelpDialog: document.getElementById('transitionTableHelpDialog'),
      saveImageMenu: document.getElementById('saveImageMenu'),
      saveImageDropdown: document.getElementById('saveImageDropdown'),
      fileMenu: document.getElementById('fileMenu'),
      fileMenuButton: document.getElementById('fileMenuButton'),
      loadExampleButton: document.getElementById('loadExampleButton'),
      loadExampleLanding: document.getElementById('loadExampleLanding'),
      settingsMenu: document.getElementById('settingsMenu'),
      settingsMenuButton: document.getElementById('settingsMenuButton'),
      transitionDrawerHandle: document.getElementById('transitionDrawerHandle'),
      toolbarNewMachine: document.getElementById('toolbarNewMachine'),
      kmapWindow: document.getElementById('kmapWindow'),
      kmapWindowHeader: document.getElementById('kmapWindowHeader'),
      kmapList: document.getElementById('kmapList'),
      kmapEmptyState: document.getElementById('kmapEmptyState'),
      kmapZipStatus: document.getElementById('kmapZipStatus'),
      kmapCircleToggle: document.getElementById('toggleKmapCircles'),
      kmapQuickRefBtn: document.getElementById('kmapQuickRef'),
      kmapQuickRefDialog: document.getElementById('kmapQuickRefDialog'),
      kmapCreateDialog: document.getElementById('kmapCreateDialog'),
      confirmKmapCreate: document.getElementById('confirmKmapCreate'),
      kmapLabelDropzone: document.getElementById('kmapLabelDropzone'),
      kmapVariablesDropzone: document.getElementById('kmapVariablesDropzone'),
      kmapColumnTray: document.getElementById('kmapColumnTray'),
      kmapTypeInput: document.getElementById('kmapType'),
      kmapDirectionInput: document.getElementById('kmapDirection'),
      kmapResizeHandle: document.getElementById('kmapResizeHandle'),
      transitionColumnBuilder: document.getElementById('transitionColumnBuilder'),
      toggleTransitionBuilderBtn: document.getElementById('toggleTransitionBuilder'),
      diagramControlsBtn: document.getElementById('diagramControlsBtn'),
      diagramControlsPopup: document.getElementById('diagramControlsPopup'),
      diagramControlsClose: document.getElementById('diagramControlsClose'),
      coachmarkLayer: document.getElementById('coachmarkLayer'),
      
      // Form fields
      machineName: document.getElementById('machineName'),
      machineType: document.getElementById('machineType'),
      stateCount: document.getElementById('stateCount'),
      inputVars: document.getElementById('inputVars'),
      outputVars: document.getElementById('outputVars'),
      nameControl: document.getElementById('nameControl'),
      typeControl: document.getElementById('typeControl'),
      stateControl: document.getElementById('stateControl'),
      inputsControl: document.getElementById('inputsControl'),
      outputsControl: document.getElementById('outputsControl'),
    };
  }

  populateStateCountSelectors() {
    const selectors = [this.elements.stateCount, this.elements.stateControl];
    selectors.forEach((sel) => {
      if (!sel || sel.dataset.populated) return;
      sel.innerHTML = '';
      allowedStateCounts.forEach((count) => {
        const opt = document.createElement('option');
        opt.value = count;
        opt.textContent = count;
        sel.appendChild(opt);
      });
      sel.dataset.populated = 'true';
    });
  }

  initDialogs() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.closeDialog(btn.dataset.close);
      });
    });
  }

  updateControls(state) {
    if (this.elements.nameControl) this.elements.nameControl.value = state.name;
    if (this.elements.typeControl) this.elements.typeControl.value = state.type;
    if (this.elements.stateControl) this.elements.stateControl.value = state.numStates;
    if (this.elements.inputsControl) this.elements.inputsControl.value = state.inputs.join(', ');
    if (this.elements.outputsControl) this.elements.outputsControl.value = state.outputs.join(', ');
    if (this.elements.toolbarTitle) this.elements.toolbarTitle.textContent = state.name;
    if (this.elements.machineName) this.elements.machineName.value = state.name;
    if (this.elements.machineType) this.elements.machineType.value = state.type;
    if (this.elements.stateCount) this.elements.stateCount.value = state.numStates;
  }

  openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.classList.remove('hidden');
  }

  closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.classList.add('hidden');
  }

  closeAllDropdowns(options = {}) {
    const { keepFile = false } = options;
    if (this.elements.saveImageMenu) this.elements.saveImageMenu.classList.add('hidden');
    if (this.elements.settingsMenu) this.elements.settingsMenu.classList.add('hidden');
    if (!keepFile && this.elements.fileMenu) this.elements.fileMenu.classList.add('hidden');
  }
}

export const ui = new UIController();
