// State Management
let currentMode = 'experiment'; // 'experiment' | 'challenge'
let experimentState = {
  activeLowEnable: false,
  inputs: { S1: 0, S0: 0, E: 1 },
  showCircuit: false
};

let challengeState = {
  targetMinterms: [],
  decoders: [
    { id: 'Y', activeLow: false, inputs: { S1: 'A', S0: 'B', E: 'C' } },
    { id: 'Z', activeLow: true, inputs: { S1: 'A', S0: 'B', E: 'C' } }
  ],
  orInputs: [], // Array of strings like 'Y0', 'Z2'
};

// DOM Elements
const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const actionBtn = document.getElementById('actionBtn');
const tutorialDialog = document.getElementById('tutorialDialog');

// Vaporwave Aesthetics
const VAPORWAVE_COLORS = {
  orange: '#FF5E00',
  fuchsia: '#FF00FF',
  blue: '#00FFFF',
  purple: '#8A2BE2'
};

// Initializations
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  renderMode();
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

function initEventListeners() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelector('.mode-btn.active').classList.remove('active');
      e.target.classList.add('active');
      currentMode = e.target.dataset.mode;
      renderMode();
    });
  });

  actionBtn.addEventListener('click', handleActionBtn);

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
}

function renderMode() {
  if (currentMode === 'experiment') {
    actionBtn.textContent = experimentState.showCircuit ? 'Hide Circuit' : 'Analyze Circuit';
    actionBtn.style.display = 'block';
    renderExperimentMode();
  } else {
    actionBtn.textContent = 'New Challenge';
    actionBtn.style.display = 'block';
    if (challengeState.targetMinterms.length === 0) {
      generateNewChallenge();
    } else {
      renderChallengeMode();
    }
  }
}

function handleActionBtn() {
  if (currentMode === 'experiment') {
    experimentState.showCircuit = !experimentState.showCircuit;
    renderMode();
  } else {
    generateNewChallenge();
  }
}

// --- Challenge Mode Logic ---

function generateNewChallenge() {
  const count = 2 + Math.floor(Math.random() * 3);
  let minterms = [];
  while (minterms.length < count) {
    const m = Math.floor(Math.random() * 8);
    if (!minterms.includes(m)) minterms.push(m);
  }
  challengeState.targetMinterms = minterms.sort((a, b) => a - b);
  
  // Solvability check:
  // If minterm 0 is present, we MUST have at least one active-low enable available
  // If minterm 7 is present, we MUST have at least one active-high enable available
  const hasZero = challengeState.targetMinterms.includes(0);
  const hasSeven = challengeState.targetMinterms.includes(7);

  if (hasZero && hasSeven) {
    // Need one of each
    challengeState.decoders[0].activeLow = true;
    challengeState.decoders[1].activeLow = false;
  } else if (hasZero) {
    // Need at least one active low
    challengeState.decoders[0].activeLow = true;
    challengeState.decoders[1].activeLow = Math.random() > 0.5;
  } else if (hasSeven) {
    // Need at least one active high
    challengeState.decoders[0].activeLow = false;
    challengeState.decoders[1].activeLow = Math.random() > 0.5;
  } else {
    // Randomized
    challengeState.decoders[0].activeLow = Math.random() > 0.5;
    challengeState.decoders[1].activeLow = Math.random() > 0.5;
  }

  challengeState.decoders[0].inputs = { S1: 'A', S0: 'A', E: 'A' };
  challengeState.decoders[1].inputs = { S1: 'A', S0: 'A', E: 'A' };
  challengeState.orInputs = Array(count).fill('Y0');
  renderChallengeMode();
}

function renderChallengeMode() {
  leftPanel.innerHTML = `
    <div class="challenge-container">
      <div class="target-function-display">
        f(A, B, C) = Σm(${challengeState.targetMinterms.join(', ')})
      </div>
      
      <div class="decoders-row">
        ${renderChallengeDecoder(0)}
        ${renderChallengeDecoder(1)}
      </div>

      <div class="or-gate-container">
        <div style="font-weight: bold; margin-bottom: 10px;">Implementation (OR Gate)</div>
        <div style="display: flex; align-items: center; gap: 0; position: relative; height: 140px; width: 100%; justify-content: center;">
          <div class="or-inputs" style="display: flex; flex-direction: column; gap: 1px; z-index: 2; margin-right: -5px;">
            ${challengeState.orInputs.map((val, idx) => {
              const totalInputs = challengeState.orInputs.length;
              const offset = (idx - (totalInputs - 1) / 2) * 25;
              return `
                <div class="pin" style="display: flex; align-items: center; justify-content: flex-end; position: relative;">
                  <select class="select-input or-input-select" data-idx="${idx}">
                    ${['Y0','Y1','Y2','Y3','Z0','Z1','Z2','Z3'].map(opt => `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                  </select>
                  <svg width="40" height="30" style="margin-left: 5px;">
                    <path d="M 0 15 L 15 15 L 25 ${15 + (offset > 0 ? -5 : offset < 0 ? 5 : 0)} L 40 ${15 + (offset > 0 ? -5 : offset < 0 ? 5 : 0)}" fill="none" stroke="var(--border)" stroke-width="2" />
                  </svg>
                </div>
              `;
            }).join('')}
          </div>
          <svg width="100" height="120" viewBox="0 0 100 100" style="z-index: 1;">
            <!-- OR Gate Body -->
            <path d="M 10 10 Q 40 50 10 90 Q 80 90 95 50 Q 80 10 10 10 Z" fill="var(--surface)" stroke="var(--text)" stroke-width="3" />
            <line x1="95" y1="50" x2="130" y2="50" stroke="var(--border)" stroke-width="2" />
            <text x="35" y="55" font-size="14" font-weight="bold" fill="var(--text)">OR</text>
          </svg>
          <div style="font-weight: bold; color: var(--vw-fuchsia); margin-left: 10px;">f</div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.decoder-input-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const dIdx = parseInt(e.target.dataset.decoder);
      const pin = e.target.dataset.pin;
      challengeState.decoders[dIdx].inputs[pin] = e.target.value;
      renderChallengeMode();
    });
  });

  document.querySelectorAll('.or-input-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      challengeState.orInputs[idx] = e.target.value;
      renderChallengeMode();
    });
  });

  renderChallengeTruthTable();
}

function getMintermExpression(s1, s0, i) {
  const b1 = (i >> 1) & 1;
  const b0 = i & 1;
  
  const s1Part = b1 ? s1 : `<span style="text-decoration: overline">${s1}</span>`;
  const s0Part = b0 ? s0 : `<span style="text-decoration: overline">${s0}</span>`;
  
  return `${s1Part}${s0Part}`;
}

function renderChallengeDecoder(idx) {
  const d = challengeState.decoders[idx];
  const id = d.id;
  const bw = 80; // Block width
  const bh = 130; // Block height
  
  return `
    <div class="decoder-container" style="position: relative; width: 160px; height: 200px;">
      <!-- Input Lines & Selects -->
      <div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;">
        <svg width="160" height="200" viewBox="0 0 160 200">
          <!-- Input Lines -->
          <line x1="5" y1="55" x2="40" y2="55" stroke="var(--border)" stroke-width="2" />
          <line x1="5" y1="95" x2="40" y2="95" stroke="var(--border)" stroke-width="2" />
          <line x1="80" y1="160" x2="80" y2="190" stroke="var(--border)" stroke-width="2" />
          
          <!-- Output Lines -->
          <line x1="120" y1="45" x2="155" y2="45" stroke="var(--border)" stroke-width="2" />
          <line x1="120" y1="75" x2="155" y2="75" stroke="var(--border)" stroke-width="2" />
          <line x1="120" y1="105" x2="155" y2="105" stroke="var(--border)" stroke-width="2" />
          <line x1="120" y1="135" x2="155" y2="135" stroke="var(--border)" stroke-width="2" />
          
          ${d.activeLow ? `<circle cx="80" cy="166" r="5" fill="var(--surface)" stroke="var(--border)" stroke-width="2" />` : ''}
        </svg>
      </div>

      <!-- Select Inputs -->
      <div style="position: absolute; left: -25px; top: 45px; display: flex; flex-direction: column; gap: 18px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <select class="select-input decoder-input-select" data-decoder="${idx}" data-pin="S1" style="pointer-events: auto;">
            ${['A','B','C'].map(v => `<option value="${v}" ${d.inputs.S1 === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <span style="font-size: 0.65rem; font-weight: bold; color: var(--muted); margin-top: -15px;">S1</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <select class="select-input decoder-input-select" data-decoder="${idx}" data-pin="S0" style="pointer-events: auto;">
            ${['A','B','C'].map(v => `<option value="${v}" ${d.inputs.S0 === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <span style="font-size: 0.65rem; font-weight: bold; color: var(--muted); margin-top: -17px;">S0</span>
        </div>
      </div>

      <div style="position: absolute; bottom: -15px; left: 55px; display: flex; flex-direction: column; align-items: center;">
        <span style="font-size: 0.65rem; font-weight: bold; color: var(--muted); margin-bottom: 2px; margin-left: 18px;">E</span>
        <select class="select-input decoder-input-select" data-decoder="${idx}" data-pin="E" style="pointer-events: auto;">
          ${['A','B','C'].map(v => `<option value="${v}" ${d.inputs.E === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>

      <!-- Main Block -->
      <div class="decoder-block challenge" style="width: ${bw}px; height: ${bh}px; position: absolute; left: 40px; top: 30px; display: flex; flex-direction: column; justify-content: center; align-items: center; border-color: var(--text) !important;">
        <div class="decoder-title" style="font-size: 0.75rem; margin: 0;">2-to-4 Dec</div>
        <div style="font-size: 0.85rem; font-weight: bold; color: var(--vw-purple);">${id}</div>
      </div>

      <!-- Output Labels & Expressions -->
      <div style="position: absolute; right: -35px; top: 30px; display: flex; flex-direction: column; gap: 14px; font-size: 0.7rem; font-weight: bold; color: var(--muted); text-align: left; width: 70px;">
        ${[0,1,2,3].map(i => {
          const pinName = `${id}${i}`;
          const isSelected = challengeState.orInputs.includes(pinName);
          const exp = getMintermExpression(d.inputs.S1, d.inputs.S0, i);
          const color = isSelected ? 'var(--vw-orange)' : 'var(--muted)';
          return `<div style="height: 16px; line-height: 16px; color: ${color};">${pinName}: ${exp}</div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function evaluateCircuit(a, b, c) {
  const vars = { 'A': a, 'B': b, 'C': c };
  const getOuts = (d) => {
    const s1 = vars[d.inputs.S1];
    const s0 = vars[d.inputs.S0];
    const en = vars[d.inputs.E];
    const isEnabled = d.activeLow ? en === 0 : en === 1;
    if (!isEnabled) return [0,0,0,0];
    let res = [0,0,0,0];
    res[(s1 << 1) | s0] = 1;
    return res;
  };
  const outsY = getOuts(challengeState.decoders[0]);
  const outsZ = getOuts(challengeState.decoders[1]);
  const allOuts = {
    'Y0': outsY[0], 'Y1': outsY[1], 'Y2': outsY[2], 'Y3': outsY[3],
    'Z0': outsZ[0], 'Z1': outsZ[1], 'Z2': outsZ[2], 'Z3': outsZ[3]
  };
  return challengeState.orInputs.some(inputName => allOuts[inputName] === 1) ? 1 : 0;
}

function renderChallengeTruthTable() {
  let html = `
    <h2>Target Truth Table</h2>
    <table class="truth-table">
      <thead>
        <tr>
          <th>A</th><th>B</th><th>C</th><th>Target f</th><th>Your f</th>
        </tr>
      </thead>
      <tbody>
  `;
  let allMatch = true;
  for (let i = 0; i < 8; i++) {
    const a = (i >> 2) & 1;
    const b = (i >> 1) & 1;
    const c = i & 1;
    const targetVal = challengeState.targetMinterms.includes(i) ? 1 : 0;
    const userVal = evaluateCircuit(a, b, c);
    const isMinterm = targetVal === 1;
    const isUserHigh = userVal === 1;
    if (isMinterm && userVal === 0) allMatch = false;
    if (!isMinterm && userVal === 1) allMatch = false;
    html += `
      <tr class="${isUserHigh ? 'match-neon' : ''}" style="opacity: ${!isMinterm ? '0.2' : '1'}">
        <td>${a}</td><td>${b}</td><td>${c}</td>
        <td style="font-weight: bold; color: var(--vw-fuchsia);">${targetVal}</td>
        <td style="font-weight: bold; color: ${userVal ? 'var(--vw-orange)' : 'var(--muted)'}">${userVal}</td>
      </tr>
    `;
  }
  html += `</tbody></table>`;
  if (allMatch) {
    html += `<div style="margin-top: 20px; padding: 10px; background: rgba(57, 255, 20, 0.2); border: 2px solid #39ff14; color: #39ff14; text-align: center; font-weight: bold; border-radius: 8px;">
               CHALLENGE COMPLETE! Perfect implementation.
             </div>`;
  }
  rightPanel.innerHTML = html;
}

// --- Experiment Mode Logic ---

function computeOutputs() {
  const s1 = experimentState.inputs.S1;
  const s0 = experimentState.inputs.S0;
  const en = experimentState.inputs.E;
  const isEnabled = experimentState.activeLowEnable ? en === 0 : en === 1;
  if (!isEnabled) return [0, 0, 0, 0];
  const decimal = (s1 << 1) | s0;
  let outs = [0, 0, 0, 0];
  outs[decimal] = 1;
  return outs;
}

function renderExperimentMode() {
  const outs = computeOutputs();
  
  // Check if the skeleton is already rendered
  let container = document.getElementById('experimentContainer');
  if (!container) {
    leftPanel.innerHTML = `
      <div id="experimentContainer">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
          <span>Active Low Enable</span>
          <label class="switch">
            <input type="checkbox" id="enableTypeToggle">
            <span class="slider round"></span>
          </label>
        </div>
        <div class="decoder-container" style="position: relative; width: 400px; height: 450px; margin: 0 auto;">
          <div id="decoderBlock" class="decoder-block" style="position: absolute; top: 50px; left: 100px; width: 200px; height: 300px; z-index: 2;">
            <div id="decoderTitle" class="decoder-title" style="text-align: center; font-weight: bold; margin-top: 10px;">2-to-4 Decoder</div>
            <div id="activeLowBubble" class="bubble hidden"></div>
          </div>
          <svg id="circuitSVG" class="circuit-overlay" viewBox="0 0 400 400" style="position: absolute; top: 0; left: 0; width: 400px; height: 400px; z-index: 1; pointer-events: none; display: block;">
            ${generateStaticCircuitSVG()}
          </svg>
          <div class="pin" style="position: absolute; top: 100px; right: 320px; display: flex; align-items: center; gap: 10px;">
            <span class="pin-label">S1</span>
            <button class="toggle-btn" data-pin="S1" id="btnS1" style="z-index: 10;">0</button>
          </div>
          <div class="pin" style="position: absolute; top: 160px; right: 320px; display: flex; align-items: center; gap: 10px;">
            <span class="pin-label">S0</span>
            <button class="toggle-btn" data-pin="S0" id="btnS0" style="z-index: 10;">0</button>
          </div>
          <div class="pin" style="position: absolute; top: 380px; left: 180px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
            <button class="toggle-btn" data-pin="E" id="btnE" style="z-index: 10;">1</button>
            <span class="pin-label" id="enLabel">E</span>
          </div>
          <div class="pin" style="position: absolute; top: 75px; left: 330px; display: flex; align-items: center; gap: 10px;">
            <div id="led0" class="led"></div>
            <span class="pin-label">Y0</span>
          </div>
          <div class="pin" style="position: absolute; top: 135px; left: 330px; display: flex; align-items: center; gap: 10px;">
            <div id="led1" class="led"></div>
            <span class="pin-label">Y1</span>
          </div>
          <div class="pin" style="position: absolute; top: 195px; left: 330px; display: flex; align-items: center; gap: 10px;">
            <div id="led2" class="led"></div>
            <span class="pin-label">Y2</span>
          </div>
          <div class="pin" style="position: absolute; top: 255px; left: 330px; display: flex; align-items: center; gap: 10px;">
            <div id="led3" class="led"></div>
            <span class="pin-label">Y3</span>
          </div>
        </div>
      </div>
    `;

    // Re-attach listeners for the new elements
    document.getElementById('enableTypeToggle').addEventListener('change', (e) => {
      experimentState.activeLowEnable = e.target.checked;
      renderExperimentMode();
    });
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pin = e.target.dataset.pin;
        experimentState.inputs[pin] = experimentState.inputs[pin] ? 0 : 1;
        renderExperimentMode();
      });
    });
  }

  // Update State-dependent elements
  document.getElementById('enableTypeToggle').checked = experimentState.activeLowEnable;
  document.getElementById('btnS1').textContent = experimentState.inputs.S1;
  document.getElementById('btnS0').textContent = experimentState.inputs.S0;
  document.getElementById('btnE').textContent = experimentState.inputs.E;
  
  const bubble = document.getElementById('activeLowBubble');
  if (experimentState.activeLowEnable) {
    bubble.classList.remove('hidden');
  } else {
    bubble.classList.add('hidden');
  }

  const block = document.getElementById('decoderBlock');
  const title = document.getElementById('decoderTitle');
  if (experimentState.showCircuit) {
    block.style.borderColor = 'var(--muted)';
    block.style.backgroundColor = 'transparent';
    title.style.display = 'none';
  } else {
    block.style.borderColor = 'var(--border)';
    block.style.backgroundColor = 'var(--bg)';
    title.style.display = 'block';
  }

  // Update LEDs
  outs.forEach((on, i) => {
    const led = document.getElementById(`led${i}`);
    if (on) led.classList.add('on');
    else led.classList.remove('on');
  });

  updateCircuitClasses(outs);
  renderTruthTable();
}

function generateStaticCircuitSVG() {
  return `
    <defs>
      <marker id="dotS1" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
        <circle cx="5" cy="5" r="5" class="signal-fill-s1"></circle>
      </marker>
      <marker id="dotS0" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
        <circle cx="5" cy="5" r="5" class="signal-fill-s0"></circle>
      </marker>
    </defs>
    <!-- Main Signal Lines -->
    <line id="line-s1-main" x1="80" y1="120" x2="100" y2="120" class="signal-path signal-s1"></line>
    <line id="line-s0-main" x1="80" y1="180" x2="100" y2="180" class="signal-path signal-s0"></line>
    <line id="line-e-main" x1="200" y1="380" x2="200" y2="350" class="signal-path signal-e"></line>
    
    <!-- Output Lines -->
    <line id="line-out0" x1="280" y1="90" x2="330" y2="90" class="signal-path signal-out"></line>
    <line id="line-out1" x1="280" y1="150" x2="330" y2="150" class="signal-path signal-out"></line>
    <line id="line-out2" x1="280" y1="210" x2="330" y2="210" class="signal-path signal-out"></line>
    <line id="line-out3" x1="280" y1="270" x2="330" y2="270" class="signal-path signal-out"></line>

    <!-- Internal Circuitry (Only visible when showCircuit is true) -->
    <g id="internalCircuit" class="hidden">
      <!-- S1 distribution -->
      <line x1="100" y1="120" x2="140" y2="120" class="signal-path signal-s1"></line>
      <circle cx="120" cy="120" r="4" class="signal-dot signal-s1-fill"></circle>
      <line x1="120" y1="120" x2="120" y2="260" class="signal-path signal-s1"></line>
      <line x1="120" y1="260" x2="240" y2="260" class="signal-path signal-s1"></line> <!-- S1 to Gate 3 -->
      <circle cx="120" cy="260" r="4" class="signal-dot signal-s1-fill"></circle>
      <line x1="120" y1="200" x2="240" y2="200" class="signal-path signal-s1"></line> <!-- S1 to Gate 2 -->
      <circle cx="120" cy="200" r="4" class="signal-dot signal-s1-fill"></circle>

      <!-- S0 distribution -->
      <line x1="100" y1="180" x2="140" y2="180" class="signal-path signal-s0"></line>
      <circle cx="110" cy="180" r="4" class="signal-dot signal-s0-fill"></circle>
      <line x1="110" y1="150" x2="110" y2="270" class="signal-path signal-s0"></line>
      <line x1="110" y1="270" x2="240" y2="270" class="signal-path signal-s0"></line> <!-- S0 to Gate 3 -->
      <circle cx="110" cy="270" r="4" class="signal-dot signal-s0-fill"></circle>
      <line x1="110" y1="150" x2="240" y2="150" class="signal-path signal-s0"></line> <!-- S0 to Gate 1 -->
      <circle cx="110" cy="150" r="4" class="signal-dot signal-s0-fill"></circle>
      
      <!-- Inverters -->
      <!-- Inverter S1 -->
      <path d="M 140 110 L 160 120 L 140 130 Z" class="signal-path signal-s1"></path>
      <circle cx="163" cy="120" r="3" class="signal-dot inverter-bubble signal-s1" style="stroke-width: 2;"></circle>
      <line x1="166" y1="120" x2="180" y2="120" class="signal-path signal-ns1"></line>
      <line x1="180" y1="140" x2="180" y2="80" class="signal-path signal-ns1"></line>
      <line x1="180" y1="80" x2="240" y2="80" class="signal-path signal-ns1"></line> <!-- NS1 to Gate 0 -->
      <circle cx="180" cy="120" r="4" class="signal-dot signal-ns1-fill"></circle>
      <line x1="180" y1="140" x2="240" y2="140" class="signal-path signal-ns1"></line> <!-- NS1 to Gate 1 -->
      <circle cx="180" cy="140" r="4" class="signal-dot signal-ns1-fill"></circle>

      <!-- Inverter S0 -->
      <path d="M 140 170 L 160 180 L 140 190 Z" class="signal-path signal-s0"></path>
      <circle cx="163" cy="180" r="3" class="signal-dot inverter-bubble signal-s0" style="stroke-width: 2;"></circle>
      <line x1="166" y1="180" x2="190" y2="180" class="signal-path signal-ns0"></line>
      <line x1="190" y1="210" x2="190" y2="90" class="signal-path signal-ns0"></line>
	  <circle cx="190" cy="180" r="4" class="signal-dot signal-ns0-fill"></circle>
      <line x1="190" y1="90" x2="240" y2="90" class="signal-path signal-ns0"></line> <!-- NS0 to Gate 0 -->
      <circle cx="190" cy="210" r="4" class="signal-dot signal-ns0-fill"></circle>
      <line x1="190" y1="210" x2="240" y2="210" class="signal-path signal-ns0"></line> <!-- NS0 to Gate 2 -->
      
      <!-- Enable distribution -->
      <line x1="200" y1="350" x2="200" y2="100" class="signal-path signal-e"></line>
      <line x1="200" y1="100" x2="240" y2="100" class="signal-path signal-e"></line> <!-- E to Gate 0 -->
      <line x1="200" y1="160" x2="240" y2="160" class="signal-path signal-e"></line> <!-- E to Gate 1 -->
      <circle cx="200" cy="160" r="4" class="signal-dot signal-e-fill"></circle>
      <line x1="200" y1="220" x2="240" y2="220" class="signal-path signal-e"></line> <!-- E to Gate 2 -->
      <circle cx="200" cy="220" r="4" class="signal-dot signal-e-fill"></circle>
      <line x1="200" y1="280" x2="240" y2="280" class="signal-path signal-e"></line> <!-- E to Gate 3 -->
      <circle cx="200" cy="280" r="4" class="signal-dot signal-e-fill"></circle>

      <!-- AND Gates -->
      <!-- Gate 0 (Y0): NS1 & NS0 & E -->
      <path d="M 240 70 L 260 70 A 20 20 0 0 1 260 110 L 240 110 Z" class="signal-path signal-gate0"></path>
      <!-- Gate 1 (Y1): NS1 & S0 & E -->
      <path d="M 240 130 L 260 130 A 20 20 0 0 1 260 170 L 240 170 Z" class="signal-path signal-gate1"></path>
      <!-- Gate 2 (Y2): S1 & NS0 & E -->
      <path d="M 240 190 L 260 190 A 20 20 0 0 1 260 230 L 240 230 Z" class="signal-path signal-gate2"></path>
      <!-- Gate 3 (Y3): S1 & S0 & E -->
      <path d="M 240 250 L 260 250 A 20 20 0 0 1 260 290 L 240 290 Z" class="signal-path signal-gate3"></path>
    </g>
  `;
}

function updateCircuitClasses(outs) {
  const { S1, S0, E } = experimentState.inputs;
  const enActive = experimentState.activeLowEnable ? E === 0 : E === 1;
  const NOT_S1 = S1 === 0 ? 1 : 0;
  const NOT_S0 = S0 === 0 ? 1 : 0;
  const show = experimentState.showCircuit;

  // Toggle Internal Circuit visibility
  const internal = document.getElementById('internalCircuit');
  if (show) internal.classList.remove('hidden');
  else internal.classList.add('hidden');

  // Update classes
  const updateClass = (selector, isHigh, baseClass) => {
    document.querySelectorAll(selector).forEach(el => {
      if (isHigh) el.classList.add('high');
      else el.classList.remove('high');
    });
  };

  updateClass('.signal-s1', S1, 'signal-s1');
  updateClass('.signal-s1-fill', S1, 'signal-s1-fill');
  updateClass('.signal-ns1', NOT_S1, 'signal-ns1');
  updateClass('.signal-ns1-fill', NOT_S1, 'signal-ns1-fill');
  
  updateClass('.signal-s0', S0, 'signal-s0');
  updateClass('.signal-s0-fill', S0, 'signal-s0-fill');
  updateClass('.signal-ns0', NOT_S0, 'signal-ns0');
  updateClass('.signal-ns0-fill', NOT_S0, 'signal-ns0-fill');

  updateClass('.signal-e', enActive, 'signal-e');
  updateClass('.signal-e-fill', enActive, 'signal-e-fill');

  // Update specific Output lines
  outs.forEach((isHigh, i) => {
    const line = document.getElementById(`line-out${i}`);
    if (line) {
      if (isHigh) line.classList.add('high');
      else line.classList.remove('high');
    }
    // Also update gate paths if showCircuit
    updateClass(`.signal-gate${i}`, isHigh, `signal-gate${i}`);
  });
}

function renderTruthTable() {
  let tableHTML = `
    <h2>Truth Table</h2>
    <table class="truth-table">
      <thead>
        <tr>
          <th>Enable (${experimentState.activeLowEnable ? "E'" : "E"})</th>
          <th>S1</th>
          <th>S0</th>
          <th>Y3</th>
          <th>Y2</th>
          <th>Y1</th>
          <th>Y0</th>
        </tr>
      </thead>
      <tbody>
  `;
  const disEn = experimentState.activeLowEnable ? 1 : 0;
  const isCurrentlyDisabled = experimentState.inputs.E === disEn;
  tableHTML += `
    <tr class="${isCurrentlyDisabled ? 'active-row' : ''}">
      <td>${disEn}</td>
      <td>X</td>
      <td>X</td>
      <td>0</td><td>0</td><td>0</td><td>0</td>
    </tr>
  `;
  const enEn = experimentState.activeLowEnable ? 0 : 1;
  for (let i = 0; i < 4; i++) {
    const s1 = (i >> 1) & 1;
    const s0 = i & 1;
    let y = [0,0,0,0];
    y[i] = 1;
    const isActive = !isCurrentlyDisabled && experimentState.inputs.S1 === s1 && experimentState.inputs.S0 === s0;
    tableHTML += `
      <tr class="${isActive ? 'active-row' : ''}">
        <td>${enEn}</td>
        <td>${s1}</td>
        <td>${s0}</td>
        <td>${y[3]}</td><td>${y[2]}</td><td>${y[1]}</td><td>${y[0]}</td>
      </tr>
    `;
  }
  tableHTML += `</tbody></table>`;
  rightPanel.innerHTML = tableHTML;
}
