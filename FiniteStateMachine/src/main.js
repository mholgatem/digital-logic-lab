import { store } from './state-store.js';
import { ui } from './ui-controller.js';
import { diagramManager } from './diagram-manager.js';
import { kmapManager } from './kmap-manager.js';
import { ioManager } from './io-manager.js';
import { transitionTableManager } from './transition-table-manager.js';
import { stateTableManager } from './state-table-manager.js';
import { onboarding } from './onboarding-manager.js';
import { parseList, getCookie, setCookie } from './utils.js';

class App {
  constructor() {
    this.store = store;
    this.ui = ui;
    this.diagram = diagramManager;
    this.kmaps = kmapManager;
    this.io = ioManager;
    this.transitionTable = transitionTableManager;
    this.stateTable = stateTableManager;
    this.onboarding = onboarding;
    this.init();
  }

  initTheme() {
    const theme = getCookie('dll_theme') || 'light';
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
  }

  init() {
    console.log('FSM Designer Initialized');
    
    this.initTheme();
    this.ui.updateControls(this.store.state);

    this.store.subscribe((state) => {
      this.ui.updateControls(state);
    });

    this.setupGlobalEvents();
    this.setupLandingEvents();
  }

  setupGlobalEvents() {
    // Theme Toggle
    const themeBtn = document.getElementById('toggleTheme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        document.body.classList.toggle('light', !isDark);
        setCookie('dll_theme', isDark ? 'dark' : 'light', 365);
        this.ui.closeAllDropdowns();
      });
    }

    // Window Resize Handling
    window.addEventListener('resize', () => {
      // Refresh layouts or re-center content as needed
      this.kmaps.renderKmapCircles();
    });

    // Dropdown close on outside click
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.dropdown')) {
        this.ui.closeAllDropdowns();
      }
    });
  }

  setupLandingEvents() {
    const newMachineBtn = document.getElementById('newMachineBtn');
    if (newMachineBtn) {
      newMachineBtn.addEventListener('click', () => {
        this.ui.openDialog('newMachineDialog');
      });
    }

    const createMachineBtn = document.getElementById('createMachine');
    if (createMachineBtn) {
      createMachineBtn.addEventListener('click', () => {
        const name = this.ui.elements.machineName.value || 'Untitled Machine';
        const type = this.ui.elements.machineType.value;
        const numStates = this.store.coerceAllowedStateCount(this.ui.elements.stateCount.value);
        const inputs = parseList(this.ui.elements.inputVars.value);
        const outputs = parseList(this.ui.elements.outputVars.value);

        this.store.update({
          name,
          type,
          numStates,
          inputs,
          outputs,
        });

        this.store.initStates();
        this.ui.closeDialog('newMachineDialog');
        if (this.ui.elements.landing) {
          this.ui.elements.landing.classList.add('hidden');
        }
        this.store.clearDirty();
      });
    }
    
    const loadExampleLanding = document.getElementById('loadExampleLanding');
    if (loadExampleLanding) {
      loadExampleLanding.addEventListener('click', () => {
         console.log('Load example clicked');
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
