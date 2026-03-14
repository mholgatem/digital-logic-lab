// State Management
let currentState = {
  difficulty: 1,
  kmapValues: Array(8).fill(0),
  selections: [],
  undoStack: [],
  activeCells: Array(8).fill(true)
};

// DOM Elements
const kmapGrid = document.getElementById('kmap');
const symmetryOverlay = document.getElementById('symmetryOverlay');
const muxDiagram = document.getElementById('muxDiagram');
const tutorialDialog = document.getElementById('tutorialDialog');

// Initializations
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  generateNewProblem();
});

function initTheme() {
  const savedTheme = getCookie('dll_theme') || 'light';
  document.body.className = savedTheme;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function initEventListeners() {
  // Difficulty Selection
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelector('.difficulty-btn.active').classList.remove('active');
      e.target.classList.add('active');
      currentState.difficulty = parseInt(e.target.dataset.difficulty);
      generateNewProblem();
    });
  });

  // Action Buttons
  document.getElementById('newProblemBtn').addEventListener('click', generateNewProblem);
  document.getElementById('resetBtn').addEventListener('click', resetProblem);
  document.getElementById('undoBtn').addEventListener('click', undoAction);
  document.getElementById('exportBtn').addEventListener('click', exportPng);
  document.getElementById('tutorialBtn').addEventListener('click', () => {
    tutorialDialog.classList.remove('hidden');
  });
  document.getElementById('closeTutorial').addEventListener('click', () => {
    tutorialDialog.classList.add('hidden');
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      undoAction();
    }
  });
}

// 3-variable K-map Mapping (Gray Code for columns BC)
// Row 0 (A=0): BC=00, BC=01, BC=11, BC=10  => Indices 0, 1, 3, 2
// Row 1 (A=1): BC=00, BC=01, BC=11, BC=10  => Indices 4, 5, 7, 6
const KMAP_MAPPING = [0, 1, 3, 2, 4, 5, 7, 6];

// Inverse mapping: From flat truth table index to display index
const INVERSE_MAPPING = [0, 1, 3, 2, 4, 5, 7, 6];

// Core Functions
function generateNewProblem() {
  console.log('Generating new problem for difficulty:', currentState.difficulty);
  
  // For now, truly random values. In a future refinement, 
  // we could ensure 'solvability' patterns based on difficulty.
  currentState.kmapValues = Array(8).fill(0).map(() => Math.random() > 0.5 ? 1 : 0);
  
  currentState.selections = [];
  currentState.undoStack = [];
  currentState.activeCells = Array(8).fill(true);
  
  renderKMap();
  updateMuxDiagram();
}

function renderKMap() {
  kmapGrid.innerHTML = '';
  
  // Variables: A (rows), B and C (columns)
  // Columns label (BC): 00 01 11 10
  // Rows label (A): 0, 1

  KMAP_MAPPING.forEach((truthTableIdx) => {
    const cell = document.createElement('div');
    cell.className = 'kmap-cell';
    cell.textContent = currentState.kmapValues[truthTableIdx];
    cell.dataset.index = truthTableIdx;
    
    // Determine binary representation for title/tooltips
    const binary = truthTableIdx.toString(2).padStart(3, '0');
    cell.title = `A=${binary[0]}, B=${binary[1]}, C=${binary[2]}`;
    
    if (currentState.activeCells[truthTableIdx]) {
      cell.classList.add('active');
    } else {
      cell.classList.add('inactive');
    }
    
    cell.addEventListener('click', () => handleCellClick(truthTableIdx));
    
    kmapGrid.appendChild(cell);
  });

  renderSymmetryControls();
}

function renderSymmetryControls() {
  // Clear previous overlay content (though it's an SVG)
  symmetryOverlay.innerHTML = '';
  
  // Lines of symmetry are at the boundaries.
  // We need to implement click detection for the boundaries themselves.
  // For now, let's keep it simple and focus on the grid rendering first.
}

function handleCellClick(index) {
  console.log('Cell clicked:', index);
}

function updateMuxDiagram() {
  muxDiagram.innerHTML = '<p>Select a line of symmetry to begin visualization.</p>';
}

function resetProblem() {
  currentState.selections = [];
  currentState.undoStack = [];
  currentState.activeCells = Array(8).fill(true);
  renderKMap();
  updateMuxDiagram();
}

function undoAction() {
  if (currentState.selections.length > 0) {
    currentState.selections.pop();
    // Recompute state based on selections
    renderKMap();
    updateMuxDiagram();
  }
}

function exportPng() {
  const container = document.querySelector('.workspace');
  html2canvas(container).then(canvas => {
    const link = document.createElement('a');
    link.download = `mux-logic-problem.png`;
    link.href = canvas.toDataURL();
    link.click();
  });
}
