// State Management
let currentState = {
  difficulty: 1,
  kmapValues: Array(8).fill(0),
  selections: [], // e.g., [{ path: '', var: 'A' }, { path: '0', var: 'C' }]
  activePath: '',
  leafInputs: {}, // e.g., { '0': 'A', '10': '1' }
  validSolutions: [] // Pre-calculated valid Mux trees
};

// DOM Elements
const kmapTableContainer = document.getElementById('kmapTableContainer');
const symmetryOverlay = document.getElementById('symmetryOverlay');
const muxDiagram = document.getElementById('muxDiagram');
const tutorialDialog = document.getElementById('tutorialDialog');

// Vaporwave Aesthetics
const VAPORWAVE_COLORS = ['#FF5E00', '#FF00FF', '#00FFFF']; // Orange, Fuchsia, Cyan

// Initializations
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  generateNewProblem();
});

// Cookie Utilities
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
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

const THEME_COOKIE = 'dll_theme';

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.remove('light');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = true;
  } else {
    document.body.classList.add('light');
    document.body.classList.remove('dark');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = false;
  }
}

function initTheme() {
  const savedTheme = getCookie(THEME_COOKIE) || 'light';
  applyTheme(savedTheme);
}

/**
 * Finds all valid Mux tree solutions for the given K-map and difficulty.
 * A solution is an object: { selections: [...], leafInputs: { path: val } }
 */
function findAllSolutions(values, maxMuxes) {
  let results = [];
  
  function solve(selections, muxesUsed) {
    let { nodes } = rebuildTreeWithSelections(selections);
    let leaves = Object.values(nodes).filter(n => !n.isSplit);
    
    // Check if this selection set CAN be solved with leaf inputs
    const literals = ["0", "1", "A", "A'", "B", "B'", "C", "C'"];
    let leafOptions = {};
    let possible = true;

    for (const leaf of leaves) {
      let validForLeaf = [];
      for (const lit of literals) {
        const v = lit.replace("'", "");
        if (['A','B','C'].includes(v) && leaf.vars.includes(v)) continue;
        if (verifyLeafLogic(leaf.path, lit, values, selections)) {
          validForLeaf.push(lit);
        }
      }
      if (validForLeaf.length === 0) {
        possible = false;
        break;
      }
      leafOptions[leaf.path] = validForLeaf;
    }

    if (possible) {
      // Generate all combinations of leaf inputs
      function combine(index, currentInputs) {
        if (index === leaves.length) {
          results.push({
            selections: JSON.parse(JSON.stringify(selections)),
            leafInputs: JSON.parse(JSON.stringify(currentInputs))
          });
          return;
        }
        const path = leaves[index].path;
        for (const lit of leafOptions[path]) {
          currentInputs[path] = lit;
          combine(index + 1, currentInputs);
        }
      }
      combine(0, {});
    }

    // Try splitting further
    if (muxesUsed < maxMuxes) {
      for (const leaf of leaves) {
        const remainingVars = ["A", "B", "C"].filter(v => !leaf.vars.includes(v));
        for (const v of remainingVars) {
          selections.push({ path: leaf.path, var: v });
          solve(selections, muxesUsed + 1);
          selections.pop();
        }
      }
    }
  }

  solve([], 0);
  
  // Deduplicate results
  let unique = [];
  let seen = new Set();
  results.forEach(r => {
    // Sort selections to avoid permutation duplicates of the same tree
    const sortedSels = [...r.selections].sort((a,b) => a.path.localeCompare(b.path) || a.var.localeCompare(b.var));
    const key = JSON.stringify(sortedSels) + JSON.stringify(r.leafInputs);
    if (!seen.has(key)) {
      unique.push(r);
      seen.add(key);
    }
  });

  return unique;
}

function verifyLeafLogic(path, lit, kmap, selections) {
  for (let i = 0; i < 8; i++) {
    const cellPath = getCellPathWithSelections(i, selections);
    if (cellPath.startsWith(path)) {
      const target = kmap[i];
      let result;
      if (lit === "0") result = 0;
      else if (lit === "1") result = 1;
      else {
        const v = lit.replace("'", "");
        const bit = getVarValue(i, v);
        result = lit.includes("'") ? (bit ? 0 : 1) : bit;
      }
      if (result !== target) return false;
    }
  }
  return true;
}

function getCellPathWithSelections(i, selections) {
  let path = "";
  let currentSel = selections.find(s => s.path === path);
  while (currentSel) {
    const v = currentSel.var;
    const val = getVarValue(i, v);
    path += val.toString();
    currentSel = selections.find(s => s.path === path);
  }
  return path;
}

function rebuildTreeWithSelections(selections) {
  const root = { path: '', rects: [{x:0, y:0, w:4, h:2}], vars: [], isSplit: false, depth: 0 };
  const nodes = { '': root };
  selections.forEach(sel => {
    let node = nodes[sel.path];
    if (!node) return;
    node.isSplit = true;
    node.splitVar = sel.var;
    let { rects0, rects1 } = splitRects(node.rects, sel.var);
    let child0 = { path: node.path + '0', rects: rects0, vars: [...node.vars, sel.var], isSplit: false, depth: node.depth + 1 };
    let child1 = { path: node.path + '1', rects: rects1, vars: [...node.vars, sel.var], isSplit: false, depth: node.depth + 1 };
    node.children = { 0: child0, 1: child1 };
    nodes[child0.path] = child0;
    nodes[child1.path] = child1;
  });
  return { root, nodes };
}

/**
 * Checks if a specific sub-region of the K-map (defined by path) is symmetric on a variable.
 */
function isSymmetricOnAxis(path, v) {
  const values = currentState.kmapValues;
  const mask = (v === 'A') ? 4 : (v === 'B' ? 2 : 1);
  
  const matchingIndices = [];
  for (let i = 0; i < 8; i++) {
    if (getCellPath(i).startsWith(path)) {
      matchingIndices.push(i);
    }
  }

  for (const i of matchingIndices) {
    if (!(i & mask)) {
      const pair = i | mask;
      if (matchingIndices.includes(pair)) {
        if (values[i] !== values[pair]) return false;
      }
    }
  }
  return true;
}

/**
 * Evaluates the entire constructed Mux tree and compares it against the target K-map.
 * @returns {boolean} - True if the solution is correct.
 */
function verifySolution() {
  const { nodes } = rebuildTree();
  
  for (let i = 0; i < 8; i++) {
    let currentPath = "";
    while (nodes[currentPath] && nodes[currentPath].isSplit) {
      const v = nodes[currentPath].splitVar;
      const bit = getVarValue(i, v);
      currentPath += bit.toString();
    }
    
    const leafVal = getLeafValue(currentPath);
    const targetVal = currentState.kmapValues[i];
    
    let result;
    if (leafVal === "0") result = 0;
    else if (leafVal === "1") result = 1;
    else if (leafVal === "A") result = getVarValue(i, 'A');
    else if (leafVal === "A'") result = getVarValue(i, 'A') ? 0 : 1;
    else if (leafVal === "B") result = getVarValue(i, 'B');
    else if (leafVal === "B'") result = getVarValue(i, 'B') ? 0 : 1;
    else if (leafVal === "C") result = getVarValue(i, 'C');
    else if (leafVal === "C'") result = getVarValue(i, 'C') ? 0 : 1;
    else return false;
    
    if (result !== targetVal) return false;
  }
  return true;
}

/**
 * Handles the selection of an input value for the active leaf node in the Mux tree.
 */
function handleInputSelection(val) {
  if (currentState.selections.length > 0 && currentState.activePath !== "") {
    currentState.leafInputs[currentState.activePath] = val;
    
    let { nodes } = rebuildTree();
    let leaves = Object.values(nodes).filter(n => !n.isSplit).map(n => n.path);
    leaves.sort();
    
    let currentIndex = leaves.indexOf(currentState.activePath);
    if (currentIndex !== -1) {
      for (let i = 1; i < leaves.length; i++) {
        let idx = (currentIndex + i) % leaves.length;
        let path = leaves[idx];
        if (getLeafValue(path) === "?") {
          currentState.activePath = path;
          break;
        }
      }
    }
    
    updateMuxVisualization();
  }
}

function initEventListeners() {
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelector('.difficulty-btn.active').classList.remove('active');
      e.target.classList.add('active');
      currentState.difficulty = parseInt(e.target.dataset.difficulty);
      generateNewProblem();
    });
  });

  document.querySelectorAll('.mux-input-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleInputSelection(e.currentTarget.dataset.val);
    });
  });

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

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const closeSettings = document.getElementById('closeSettings');
  const darkModeToggle = document.getElementById('darkModeToggle');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsDialog.classList.remove('hidden');
    });
  }

  if (closeSettings) {
    closeSettings.addEventListener('click', () => {
      settingsDialog.classList.add('hidden');
    });
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      applyTheme(theme);
      setCookie(THEME_COOKIE, theme, 365);
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      undoAction();
    }
  });
}

// 3-variable K-map Mapping (AB across top, C down side)
const KMAP_MAPPING = [
  [0, 2, 6, 4], // Row 0 (C=0)
  [1, 3, 7, 5]  // Row 1 (C=1)
];

function countSingles(vals) {
  let singles = 0;
  for (let i = 0; i < 8; i++) {
    const pA = i ^ 4; // Flip bit 2
    const pB = i ^ 2; // Flip bit 1
    const pC = i ^ 1; // Flip bit 0
    if (vals[i] !== vals[pA] && vals[i] !== vals[pB] && vals[i] !== vals[pC]) {
      singles++;
    }
  }
  return singles;
}

function generateNewProblem() {
  console.log('Generating new problem for difficulty:', currentState.difficulty);
  
  let values = Array(8).fill(0);
  let attempts = 0;
  const MAX_ATTEMPTS = 1000;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    for (let i = 0; i < 8; i++) {
      values[i] = Math.random() > 0.5 ? 1 : 0;
    }

    const singles = countSingles(values);
    const isSymmetricA = [0,1,2,3].every(i => values[i] === values[i ^ 4]);
    const isSymmetricB = [0,1,4,5].every(i => values[i] === values[i ^ 2]);
    const isSymmetricC = [0,2,4,6].every(i => values[i] === values[i ^ 1]);
    const anySymmetry = isSymmetricA || isSymmetricB || isSymmetricC;

    if (currentState.difficulty === 1) {
      if (anySymmetry && singles === 0) break;
    } else if (currentState.difficulty === 2) {
      if (!anySymmetry && (singles === 1 || singles === 2)) break;
    } else {
      if (!anySymmetry && singles >= 3) break;
    }

    if (attempts > 100 && currentState.difficulty === 1) {
      const axis = Math.floor(Math.random() * 3);
      const mask = [4, 2, 1][axis];
      for (let i = 0; i < 8; i++) {
        if (!(i & mask)) {
          values[i | mask] = values[i];
        }
      }
      if (countSingles(values) === 0) break;
    }
  }
  
  if (values.every(v => v === 0) || values.every(v => v === 1)) {
    return generateNewProblem();
  }

  currentState.kmapValues = values;
  currentState.validSolutions = findAllSolutions(values, currentState.difficulty);
  
  if (currentState.validSolutions.length === 0) {
    return generateNewProblem();
  }

  resetProblem();
}

function renderKMap() {
  kmapTableContainer.innerHTML = '';
  
  const table = document.createElement('table');
  table.className = 'kmap-table';
  
  const headerRow = document.createElement('tr');
  const cornerTh = document.createElement('th');
  cornerTh.innerHTML = `
    <div class="kmap-corner-label">
      <div class="kmap-diagonal"></div>
      <div class="kmap-variable-block kmap-vars-row">
        <span class="kmap-var">C</span>
      </div>
      <div class="kmap-variable-block kmap-vars-col">
        <span class="kmap-var">AB</span>
      </div>
    </div>
  `;
  headerRow.appendChild(cornerTh);
  
  ['00', '01', '11', '10'].forEach(code => {
    const th = document.createElement('th');
    th.innerHTML = `<span class="kmap-gray-code">${code}</span>`;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);
  
  KMAP_MAPPING.forEach((rowIndices, rowIndex) => {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    rowHeader.innerHTML = `<span class="kmap-gray-code">${rowIndex}</span>`;
    tr.appendChild(rowHeader);
    
    rowIndices.forEach(truthTableIdx => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'kmap-cell-input';
      input.value = currentState.kmapValues[truthTableIdx];
      input.readOnly = true;
      input.dataset.index = truthTableIdx;
      
      td.appendChild(input);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  
  kmapTableContainer.appendChild(table);
  updateMuxVisualization();
}

// Tree logic
function splitRects(rects, V) {
  let rects0 = [];
  let rects1 = [];
  rects.forEach(r => {
    if (V === 'A') {
      if (r.x < 2) rects0.push({x: r.x, y: r.y, w: Math.min(r.w, 2 - r.x), h: r.h});
      if (r.x + r.w > 2) rects1.push({x: Math.max(r.x, 2), y: r.y, w: r.x + r.w - Math.max(r.x, 2), h: r.h});
    } else if (V === 'B') {
      if (r.x < 1) rects0.push({x: r.x, y: r.y, w: Math.min(r.w, 1 - r.x), h: r.h});
      if (r.x + r.w > 3) rects0.push({x: Math.max(r.x, 3), y: r.y, w: r.x + r.w - Math.max(r.x, 3), h: r.h});
      let rx1 = Math.max(r.x, 1);
      let rx2 = Math.min(r.x + r.w, 3);
      if (rx1 < rx2) rects1.push({x: rx1, y: r.y, w: rx2 - rx1, h: r.h});
    } else if (V === 'C') {
      if (r.y < 1) rects0.push({x: r.x, y: r.y, w: r.w, h: Math.min(r.h, 1 - r.y)});
      if (r.y + r.h > 1) rects1.push({x: r.x, y: Math.max(r.y, 1), w: r.w, h: r.y + r.h - Math.max(r.y, 1)});
    }
  });
  return { rects0, rects1 };
}

function getSplitLineSegments(rects, V) {
  let segments = [];
  rects.forEach(r => {
    if (V === 'A') {
      if (r.x < 2 && r.x + r.w > 2) segments.push({x1: 2, y1: r.y, x2: 2, y2: r.y + r.h, horizontal: false});
    } else if (V === 'B') {
      if (r.x < 1 && r.x + r.w > 1) segments.push({x1: 1, y1: r.y, x2: 1, y2: r.y + r.h, horizontal: false});
      if (r.x < 3 && r.x + r.w > 3) segments.push({x1: 3, y1: r.y, x2: 3, y2: r.y + r.h, horizontal: false});
    } else if (V === 'C') {
      if (r.y < 1 && r.y + r.h > 1) segments.push({x1: r.x, y1: 1, x2: r.x + r.w, y2: 1, horizontal: true});
    }
  });
  return segments;
}

function rebuildTree() {
  return rebuildTreeWithSelections(currentState.selections);
}

function renderSymmetryControls() {
  const wrapper = document.querySelector('.kmap-grid-wrapper');
  wrapper.querySelectorAll('.symmetry-selector').forEach(s => s.remove());
  
  let { root, nodes } = rebuildTree();
  const cellWidth = 50;
  const cellHeight = 50;
  const headerOffsetX = 50;
  const headerOffsetY = 50;

  Object.values(nodes).forEach(node => {
    if (node.isSplit) return; // Only leaves get hit areas
    
    ['A', 'B', 'C'].forEach(v => {
      if (!node.vars.includes(v)) {
        let segments = getSplitLineSegments(node.rects, v);
        if (segments.length > 0) {
          let groupId = `sel-${node.path || 'root'}-${v}`;
          segments.forEach(seg => {
            let div = document.createElement('div');
            div.className = `symmetry-selector ${groupId}`;
            
            if (seg.horizontal) {
              div.style.left = `${headerOffsetX + seg.x1 * cellWidth}px`;
              div.style.top = `${headerOffsetY + seg.y1 * cellHeight - 10}px`;
              div.style.width = `${(seg.x2 - seg.x1) * cellWidth}px`;
              div.style.height = '20px';
            } else {
              div.style.left = `${headerOffsetX + seg.x1 * cellWidth - 10}px`;
              div.style.top = `${headerOffsetY + seg.y1 * cellHeight}px`;
              div.style.width = '20px';
              div.style.height = `${(seg.y2 - seg.y1) * cellHeight}px`;
            }
            
            div.addEventListener('mouseenter', () => {
              document.querySelectorAll(`.${groupId}`).forEach(el => el.classList.add('hover-active'));
            });
            div.addEventListener('mouseleave', () => {
              document.querySelectorAll(`.${groupId}`).forEach(el => el.classList.remove('hover-active'));
            });
            div.addEventListener('click', () => handleSymmetryClick(node.path, v));
            
            wrapper.appendChild(div);
          });
        }
      }
    });
  });
}

function renderSymmetryLines() {
  symmetryOverlay.innerHTML = '';
  let { root, nodes } = rebuildTree();
  const cellWidth = 50;
  const cellHeight = 50;
  const headerOffsetX = 50;
  const headerOffsetY = 50;

  currentState.selections.forEach((sel) => {
    let node = nodes[sel.path];
    if (!node) return;
    
    let segments = getSplitLineSegments(node.rects, sel.var);
    let color = VAPORWAVE_COLORS[node.depth % 3];

    segments.forEach(seg => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'wavy-line');
      path.setAttribute('stroke', color);
      
      let x1 = headerOffsetX + seg.x1 * cellWidth;
      let y1 = headerOffsetY + seg.y1 * cellHeight;
      let x2 = headerOffsetX + seg.x2 * cellWidth;
      let y2 = headerOffsetY + seg.y2 * cellHeight;
      
      path.setAttribute('d', generateWavyPath(x1, y1, x2, y2, seg.horizontal));
      symmetryOverlay.appendChild(path);
    });
  });
}

function generateWavyPath(x1, y1, x2, y2, horizontal = false) {
  let d = `M ${x1} ${y1}`;
  const segments = 8;
  const wavelength = horizontal ? (x2 - x1) / segments : (y2 - y1) / segments;
  const amplitude = 5;

  for (let i = 1; i <= segments; i++) {
    if (horizontal) {
      const midX = x1 + (i - 0.5) * wavelength;
      const endX = x1 + i * wavelength;
      const offset = (i % 2 === 0) ? amplitude : -amplitude;
      d += ` Q ${midX} ${y1 + offset}, ${endX} ${y1}`;
    } else {
      const midY = y1 + (i - 0.5) * wavelength;
      const endY = y1 + i * wavelength;
      const offset = (i % 2 === 0) ? amplitude : -amplitude;
      d += ` Q ${x1 + offset} ${midY}, ${x1} ${endY}`;
    }
  }
  return d;
}

function getVarValue(i, v) {
  if (v === 'A') return (i & 4) ? 1 : 0;
  if (v === 'B') return (i & 2) ? 1 : 0;
  if (v === 'C') return (i & 1) ? 1 : 0;
}

function getCellPath(i) {
  let path = "";
  let currentSel = currentState.selections.find(s => s.path === path);
  while (currentSel) {
    const v = currentSel.var;
    const val = getVarValue(i, v);
    path += val.toString();
    currentSel = currentState.selections.find(s => s.path === path);
  }
  return path;
}

function updateCellStates() {
  let activeRows = new Set();
  let activeCols = new Set();

  document.querySelectorAll('.kmap-cell-input').forEach(input => {
    const i = parseInt(input.dataset.index);
    input.value = currentState.kmapValues[i]; // Update the visible value!
    
    const p = getCellPath(i);
    if (p.startsWith(currentState.activePath)) {
      input.classList.add('active');
      input.classList.remove('inactive');
      
      let rowIndex = KMAP_MAPPING[0].includes(i) ? 0 : 1;
      let colIndex = KMAP_MAPPING[rowIndex].indexOf(i);
      activeRows.add(rowIndex);
      activeCols.add(colIndex);
    } else {
      input.classList.remove('active');
      input.classList.add('inactive');
    }
  });

  document.querySelectorAll('.kmap-table tr').forEach((tr, rIdx) => {
    if (rIdx === 0) {
      tr.querySelectorAll('th').forEach((th, cIdx) => {
        if (cIdx === 0) return; // Corner
        if (activeCols.has(cIdx - 1)) {
          th.classList.remove('inactive');
        } else {
          th.classList.add('inactive');
        }
      });
    } else {
      let th = tr.querySelector('th');
      if (activeRows.has(rIdx - 1)) {
        th.classList.remove('inactive');
      } else {
        th.classList.add('inactive');
      }
    }
  });
}

function getLeafValue(path) {
  if (currentState.leafInputs && currentState.leafInputs[path] !== undefined) {
    return currentState.leafInputs[path];
  }
  
  let values = [];
  for (let i = 0; i < 8; i++) {
    if (getCellPath(i).startsWith(path)) {
      values.push(currentState.kmapValues[i]);
    }
  }
  if (values.length === 0) return "";
  return "?";
}

function updateMuxDiagram() {
  const svgNS = 'http://www.w3.org/2000/svg';
  
  if (currentState.selections.length === 0) {
    muxDiagram.innerHTML = '<p style="margin: 0; padding: 1.5rem;">Select a line of symmetry to begin visualization.</p>';
    return;
  }
  
  muxDiagram.innerHTML = '';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 600 300');
  svg.style.overflow = 'visible';
  
  let { root, nodes } = rebuildTree();
  
  const MUX_WIDTH = 50;
  const MUX_HEIGHT = 100;
  const X_SPACING = 140;
  const INPUT_LENGTH = 20;
  
  function calcLayout(node, x, y) {
    node.x = x;
    node.y = y;
    if (node.isSplit) {
      let child0 = node.children[0];
      let child1 = node.children[1];
      let y0 = child0.isSplit ? y - MUX_HEIGHT * 0.45 - 25 : y - MUX_HEIGHT * 0.25;
      let y1 = child1.isSplit ? y + MUX_HEIGHT * 0.45 + 25 : y + MUX_HEIGHT * 0.25;
      calcLayout(child0, x - X_SPACING, y0);
      calcLayout(child1, x - X_SPACING, y1);
    }
  }
  
  const startX = 500;
  const startY = 150;
  calcLayout(root, startX, startY);
  
  function drawNode(node) {
    if (node.isSplit) {
      let child0 = node.children[0];
      let child1 = node.children[1];
      let color = VAPORWAVE_COLORS[node.depth % 3];
      
      let xL = node.x - MUX_WIDTH;
      let xR = node.x;
      let yT1 = node.y - MUX_HEIGHT/2;
      let yB1 = node.y + MUX_HEIGHT/2;
      let yT2 = node.y - MUX_HEIGHT/4;
      let yB2 = node.y + MUX_HEIGHT/4;
      
      let input0Y = node.y - MUX_HEIGHT/4;
      let input1Y = node.y + MUX_HEIGHT/4;
      
      // Draw wires for child0
      let w0_color = currentState.activePath.startsWith(child0.path) ? 'var(--primary)' : 'var(--border)';
      let w0_width = currentState.activePath.startsWith(child0.path) ? '4' : '2';
      
      if (!child0.isSplit) {
        // Short straight line for leaf
        let line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', xL - INPUT_LENGTH);
        line.setAttribute('y1', input0Y);
        line.setAttribute('x2', xL);
        line.setAttribute('y2', input0Y);
        line.setAttribute('stroke', w0_color);
        line.setAttribute('stroke-width', w0_width);
        svg.insertBefore(line, svg.firstChild);
        
        let hit = line.cloneNode();
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '20');
        hit.style.cursor = 'pointer';
        hit.addEventListener('click', () => {
          currentState.activePath = child0.path;
          updateMuxVisualization();
        });
        svg.appendChild(hit);
      } else {
        // Jog line for MUX
        let path = document.createElementNS(svgNS, 'path');
        let d = `M ${child0.x} ${child0.y} H ${child0.x + 20} V ${input0Y} H ${xL}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', w0_color);
        path.setAttribute('stroke-width', w0_width);
        svg.insertBefore(path, svg.firstChild);
      }

      // Draw wires for child1
      let w1_color = currentState.activePath.startsWith(child1.path) ? 'var(--primary)' : 'var(--border)';
      let w1_width = currentState.activePath.startsWith(child1.path) ? '4' : '2';
      
      if (!child1.isSplit) {
        // Short straight line for leaf
        let line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', xL - INPUT_LENGTH);
        line.setAttribute('y1', input1Y);
        line.setAttribute('x2', xL);
        line.setAttribute('y2', input1Y);
        line.setAttribute('stroke', w1_color);
        line.setAttribute('stroke-width', w1_width);
        svg.insertBefore(line, svg.firstChild);
        
        let hit = line.cloneNode();
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '20');
        hit.style.cursor = 'pointer';
        hit.addEventListener('click', () => {
          currentState.activePath = child1.path;
          updateMuxVisualization();
        });
        svg.appendChild(hit);
      } else {
        // Jog line for MUX
        let path = document.createElementNS(svgNS, 'path');
        let d = `M ${child1.x} ${child1.y} H ${child1.x + 20} V ${input1Y} H ${xL}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', w1_color);
        path.setAttribute('stroke-width', w1_width);
        svg.insertBefore(path, svg.firstChild);
      }

      // Mux body (Trapezoid)
      let polygon = document.createElementNS(svgNS, 'polygon');
      polygon.setAttribute('points', `${xL},${yT1} ${xR},${yT2} ${xR},${yB2} ${xL},${yB1}`);
      polygon.setAttribute('fill', 'var(--surface)');
      polygon.setAttribute('stroke', color);
      polygon.setAttribute('stroke-width', '2');
      svg.appendChild(polygon);
      
      // Select Line
      let textSel = document.createElementNS(svgNS, 'text');
      textSel.setAttribute('x', node.x - MUX_WIDTH/2);
      textSel.setAttribute('y', node.y + MUX_HEIGHT/2 + 20);
      textSel.setAttribute('text-anchor', 'middle');
      textSel.setAttribute('fill', color);
      textSel.setAttribute('font-weight', 'bold');
      textSel.textContent = node.splitVar;
      svg.appendChild(textSel);
      
      let lineSel = document.createElementNS(svgNS, 'line');
      lineSel.setAttribute('x1', node.x - MUX_WIDTH/2);
      lineSel.setAttribute('y1', node.y + MUX_HEIGHT/2 - 5);
      lineSel.setAttribute('x2', node.x - MUX_WIDTH/2);
      lineSel.setAttribute('y2', node.y + MUX_HEIGHT/2 + 5);
      lineSel.setAttribute('stroke', color);
      lineSel.setAttribute('stroke-width', '2');
      svg.appendChild(lineSel);
      
      // 0/1 Labels
      let text0 = document.createElementNS(svgNS, 'text');
      text0.setAttribute('x', xL + 8);
      text0.setAttribute('y', input0Y + 4);
      text0.setAttribute('fill', 'var(--text)');
      text0.setAttribute('font-size', '12px');
      text0.textContent = '0';
      svg.appendChild(text0);
      
      let text1 = document.createElementNS(svgNS, 'text');
      text1.setAttribute('x', xL + 8);
      text1.setAttribute('y', input1Y + 4);
      text1.setAttribute('fill', 'var(--text)');
      text1.setAttribute('font-size', '12px');
      text1.textContent = '1';
      svg.appendChild(text1);
      
      drawNode(child0);
      drawNode(child1);
    } else {
      let val = getLeafValue(node.path);
      let leafText = document.createElementNS(svgNS, 'text');
      
      let textX = node.x + 70; 
      let textY = node.y - 15;
      
      leafText.setAttribute('x', textX);
      leafText.setAttribute('y', textY);
      leafText.setAttribute('text-anchor', 'end');
      leafText.setAttribute('fill', 'var(--text)');
      leafText.setAttribute('font-size', '16px');
      leafText.setAttribute('font-weight', 'bold');
      
      // If val contains ' (e.g. A'), render overline
      if (val.includes("'")) {
        leafText.setAttribute('text-decoration', 'overline');
        leafText.textContent = val.replace("'", "");
      } else {
        leafText.textContent = val;
      }
      
      svg.appendChild(leafText);
    }
  }
  
  let rootWire = document.createElementNS(svgNS, 'line');
  rootWire.setAttribute('x1', root.x);
  rootWire.setAttribute('y1', root.y);
  rootWire.setAttribute('x2', root.x + 30);
  rootWire.setAttribute('y2', root.y);
  rootWire.setAttribute('stroke', currentState.activePath === '' ? 'var(--primary)' : 'var(--border)');
  rootWire.setAttribute('stroke-width', currentState.activePath === '' ? '4' : '2');
  svg.insertBefore(rootWire, svg.firstChild);
  
  let outText = document.createElementNS(svgNS, 'text');
  outText.setAttribute('x', root.x + 35);
  outText.setAttribute('y', root.y + 5);
  outText.setAttribute('fill', 'var(--text)');
  outText.setAttribute('font-weight', 'bold');
  outText.textContent = 'OUT';
  svg.appendChild(outText);

  drawNode(root);
  muxDiagram.appendChild(svg);
}

function updateMuxVisualization() {
  updateCellStates();
  renderSymmetryControls();
  renderSymmetryLines();
  updateMuxDiagram();
  updateInstructions();
}

function handleSymmetryClick(path, v) {
  if (currentState.selections.length >= 3) return;
  currentState.selections.push({ path, var: v });
  currentState.activePath = path + "0"; 
  updateMuxVisualization();
}

function resetProblem() {
  currentState.selections = [];
  currentState.activePath = "";
  currentState.leafInputs = {};
  
  // ALWAYS re-render the full table to ensure a clean state
  renderKMap();
}

function undoAction() {
  if (currentState.selections.length > 0) {
    currentState.selections.pop();
    if (currentState.selections.length > 0) {
       currentState.activePath = currentState.selections[currentState.selections.length - 1].path + "0";
    } else {
       currentState.activePath = "";
    }
    updateMuxVisualization();
  }
}

function exportPng() {
  const container = document.querySelector('.workspace');
  
  // Hide input controls
  const controls = document.querySelector('.kmap-input-controls');
  const oldControlsDisplay = controls ? controls.style.display : '';
  if (controls) controls.style.display = 'none';
  
  // Temporarily disable 'inactive' class
  const inactiveElements = document.querySelectorAll('.inactive');
  inactiveElements.forEach(el => el.classList.remove('inactive'));
  
  // Replace inputs with divs for html2canvas to fix alignment issues
  const inputs = document.querySelectorAll('.kmap-cell-input');
  const tempDivs = [];
  inputs.forEach(input => {
    const div = document.createElement('div');
    div.textContent = input.value;
    div.className = input.className;
    div.style.display = 'flex';
    div.style.justifyContent = 'center';
    div.style.alignItems = 'center';
    div.style.width = '100%';
    div.style.height = '100%';
    input.parentNode.insertBefore(div, input);
    input.style.display = 'none';
    tempDivs.push({input, div});
  });

  html2canvas(container).then(canvas => {
    const link = document.createElement('a');
    link.download = `mux-logic-problem.png`;
    link.href = canvas.toDataURL();
    link.click();

    // Restore state
    if (controls) controls.style.display = oldControlsDisplay;
    inactiveElements.forEach(el => el.classList.add('inactive'));
    tempDivs.forEach(({input, div}) => {
      input.style.display = '';
      div.remove();
    });
  });
}

/**
 * Updates the content and controls of the instructional speech bubble based on current state.
 */
function updateInstructions() {
  const textEl = document.getElementById('instructionText');
  const controlsEl = document.getElementById('bubbleControls');
  if (!textEl || !controlsEl) return;

  controlsEl.innerHTML = '';

  // 1. Initial State
  if (currentState.selections.length === 0) {
    textEl.textContent = "Start by finding symmetry in the kmap. Click a line of symmetry to see the result.";
    return;
  }

  // Real-time verification against pre-calculated solutions
  const matchesSelections = (userSels, solSels) => {
    // Check if user's current tree structure matches a prefix of this solution
    return userSels.every(us => solSels.some(ss => ss.path === us.path && ss.var === us.var));
  };

  const matchesLeafInputs = (userInputs, solInputs) => {
    return Object.entries(userInputs).every(([path, val]) => solInputs[path] === val);
  };

  let validSels = currentState.validSolutions.filter(sol => matchesSelections(currentState.selections, sol.selections));
  let fullyValidSels = validSels.filter(sol => matchesLeafInputs(currentState.leafInputs, sol.leafInputs));

  // Determine error state
  if (fullyValidSels.length === 0) {
    if (validSels.length === 0) {
      // Deviation was an axis choice
      textEl.innerHTML = "Uh-Oh! <br>Looks like you are going to require more muxes than are available on this difficulty level. <br><br>Lets undo that!";
      const undoBtn = document.createElement('button');
      undoBtn.className = 'bubble-btn undo';
      undoBtn.textContent = 'Undo Selection';
      undoBtn.onclick = undoAction;
      controlsEl.appendChild(undoBtn);
    } else {
      // Deviation was an input choice
      textEl.innerHTML = "Uh-Oh! <br>That's not a solution for the logic problem. <br><br>Try again?<br>";
      const resetBtn = document.createElement('button');
      resetBtn.className = 'bubble-btn';
      resetBtn.textContent = 'Reset Problem';
      resetBtn.onclick = resetProblem;
      controlsEl.appendChild(resetBtn);
    }
    return;
  }

  // Check if current problem is finished
  let { nodes } = rebuildTree();
  let leaves = Object.values(nodes).filter(n => !n.isSplit);
  let allDetermined = leaves.every(n => getLeafValue(n.path) !== "?");

  if (allDetermined) {
    textEl.innerHTML = "Great job! You've solved the logic problem using multiplexers. <br><br>Click 'New Problem' to try another one!";
    return;
  }

  // Instructional State
  // Find the selection that corresponds to the current activePath's parent
  const nodePath = currentState.activePath.slice(0, -1);
  const relevantSel = currentState.selections.find(s => s.path === nodePath);
  
  if (!relevantSel) return; // Should not happen if selections exist

  const axis = relevantSel.var;
  const focus = currentState.activePath.slice(-1); 
  
  // Logic to determine if we just selected a NEW mux or if we are evaluating inputs
  const isInitialSymmetry = currentState.selections.length === 1 && Object.keys(currentState.leafInputs).length === 0 && currentState.activePath === "0";

  if (isInitialSymmetry) {
     textEl.innerHTML = `Great! You chose symmetry on <strong>${axis}</strong>.<br>When <strong>${axis}</strong> is <strong>${focus}</strong>, do we have symmetry? <br><br>If so, what is the input value?`;
  } else {
     // Check if we are at the very start of a NEW mux branch (before any inputs filled for this mux)
     // A "new mux" prompt is shown if the user just ADDED a selection at this nodePath 
     // AND hasn't provided any inputs for its children yet.
     const muxHasInputs = Object.keys(currentState.leafInputs).some(pk => pk.startsWith(nodePath));
     
     // We only show the "That's right" prompt if the relevant selection is the MOST RECENT one
     const isLatestSelection = currentState.selections[currentState.selections.length - 1] === relevantSel;
     const isNewMuxPrompt = isLatestSelection && !muxHasInputs && nodePath !== "";

     if (isNewMuxPrompt) {
        const muxNum = (currentState.selections.length === 2) ? "2nd" : "3rd";
        textEl.innerHTML = `That's right! You need a <strong>${muxNum}</strong> mux to solve this. <br><br>When <strong>${axis}</strong> is <strong>${focus}</strong>, what is the input?`;
     } else {
        textEl.innerHTML = `Now, when <strong>${axis}</strong> is <strong>${focus}</strong>, is there symmetry? <br><br>If so, what is the input?`;
     }
  }

  // Render Buttons
  const row1 = ["A'", "B'", "C'", "0"];
  const row2 = ["A", "B", "C", "1"];
  
  [row1, row2].forEach(row => {
    row.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'bubble-btn';
      if (opt.endsWith("'")) {
        btn.innerHTML = `<span style="text-decoration: overline">${opt[0]}</span>`;
      } else {
        btn.textContent = opt;
      }
      btn.onclick = () => handleInputSelection(opt);
      controlsEl.appendChild(btn);
    });
  });
}
