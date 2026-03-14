export const initialState = {
  name: 'Untitled Machine',
  type: 'moore',
  numStates: 4,
  inputs: [],
  outputs: [],
  states: [],
  transitions: [],
  showBinary: true,
  transitionTable: { cells: {} },
  transitionTableVerified: false,
  kmaps: [],
  isDirty: false,
};

const allowedStateCounts = [1, 2, 4, 8, 16, 32];

export class StateStore {
  constructor(initialState) {
    this.state = { ...initialState };
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach((l) => l(this.state));
  }

  update(newState) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  markDirty() {
    this.state.isDirty = true;
    this.notify();
  }

  clearDirty() {
    this.state.isDirty = false;
    this.notify();
  }

  initStates() {
    const numStates = this.state.numStates;
    const bitCount = Math.ceil(Math.log2(numStates)) || 1;
    
    const states = Array.from({ length: numStates }, (_, i) => ({
      id: i,
      label: `S${i}`,
      description: '',
      binary: i.toString(2).padStart(bitCount, '0'),
      outputs: this.state.outputs.map(() => '0'),
      placed: false,
      hasBeenPlaced: false,
      x: 120 + i * 25,
      y: 120 + i * 20,
      radius: 38,
    }));

    this.update({
      states,
      transitions: [],
      transitionTable: { cells: {} },
      transitionTableVerified: false,
      kmaps: [],
    });
  }

  coerceAllowedStateCount(value) {
    const num = parseInt(value, 10);
    if (allowedStateCounts.includes(num)) return num;
    return allowedStateCounts[0];
  }

  uniqueId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export const store = new StateStore(initialState);
