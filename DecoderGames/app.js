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
  challengeState.decoders[0].activeLow = Math.random() > 0.5;
  challengeState.decoders[1].activeLow = Math.random() > 0.5;
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
        <div style="display: flex; align-items: center; gap: 20px;">
          <div class="or-inputs" style="display: flex; flex-direction: column; gap: 10px;">
            ${challengeState.orInputs.map((val, idx) => `
              <div class="pin">
                <select class="select-input or-input-select" data-idx="${idx}">
                  ${['Y0','Y1','Y2','Y3','Z0','Z1','Z2','Z3'].map(opt => `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                </select>
                <div style="width: 20px; height: 2px; background: var(--border);"></div>
              </div>
            `).join('')}
          </div>
          <div class="or-gate-body">OR</div>
          <div style="width: 30px; height: 2px; background: var(--border);"></div>
          <div style="font-weight: bold; color: var(--vw-fuchsia);">f</div>
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

function renderChallengeDecoder(idx) {
  const d = challengeState.decoders[idx];
  const id = d.id;
  return `
    <div class="decoder-container" style="position: relative; width: 180px; height: 250px;">
      <div class="decoder-block challenge" style="width: 120px; height: 180px; left: 30px; top: 20px;">
        <div class="decoder-title" style="font-size: 0.9rem; margin-top: 10px;">2-to-4 Dec (${id})</div>
        ${d.activeLow ? `<div class="bubble" style="bottom: -16px; left: 50%; transform: translateX(-50%); width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border); background-color: var(--surface);"></div>` : ''}
      </div>
      
      <div style="position: absolute; left: -10px; top: 50px; display: flex; flex-direction: column; gap: 20px;">
        ${['S1', 'S0'].map(pin => `
          <div class="pin">
            <select class="select-input decoder-input-select" data-decoder="${idx}" data-pin="${pin}">
              ${['A','B','C'].map(v => `<option value="${v}" ${d.inputs[pin] === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <span style="font-size: 0.7rem; font-weight: bold;">${pin}</span>
          </div>
        `).join('')}
      </div>

      <div style="position: absolute; bottom: -20px; left: 65px; display: flex; flex-direction: column; align-items: center;">
        <select class="select-input decoder-input-select" data-decoder="${idx}" data-pin="E">
          ${['A','B','C'].map(v => `<option value="${v}" ${d.inputs.E === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <span style="font-size: 0.7rem; font-weight: bold;">E</span>
      </div>

      <div style="position: absolute; right: 0px; top: 40px; display: flex; flex-direction: column; gap: 18px; font-size: 0.8rem; font-weight: bold; color: var(--muted);">
        <div>${id}0</div><div>${id}1</div><div>${id}2</div><div>${id}3</div>
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
      <tr class="${isUserHigh ? 'match-neon' : ''}" style="opacity: ${!isMinterm ? '0.1' : '1'}">
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
  const enLabel = "E"; 
  leftPanel.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
      <span>Active Low Enable</span>
      <label class="switch">
        <input type="checkbox" id="enableTypeToggle" ${experimentState.activeLowEnable ? 'checked' : ''}>
        <span class="slider round"></span>
      </label>
    </div>
    <div class="decoder-container" style="position: relative; width: 400px; height: 450px; margin: 0 auto;">
      <div class="decoder-block" style="position: absolute; top: 50px; left: 100px; width: 200px; height: 300px; border: 4px solid ${experimentState.showCircuit ? 'var(--muted)' : 'var(--border)'}; background-color: ${experimentState.showCircuit ? 'transparent' : 'var(--bg)'}; z-index: 2;">
        <div class="decoder-title" style="text-align: center; font-weight: bold; margin-top: 10px; display: ${experimentState.showCircuit ? 'none' : 'block'}; color: var(--text);">2-to-4 Decoder</div>
        ${experimentState.activeLowEnable ? `<div class="bubble" style="position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%); width: 12px; height: 12px; border-radius: 50%; border: 2px solid ${experimentState.showCircuit ? 'var(--muted)' : 'var(--border)'}; background-color: var(--surface);"></div>` : ''}
      </div>
      <svg class="circuit-overlay" viewBox="0 0 400 400" style="position: absolute; top: 0; left: 0; width: 400px; height: 400px; z-index: 1; pointer-events: none; display: block;">
         ${generateCircuitSVG(outs)}
      </svg>
      <div class="pin" style="position: absolute; top: 100px; right: 320px; display: flex; align-items: center; gap: 10px;">
        <span class="pin-label">S1</span>
        <button class="toggle-btn" data-pin="S1" style="z-index: 10;">${experimentState.inputs.S1}</button>
      </div>
      <div class="pin" style="position: absolute; top: 160px; right: 320px; display: flex; align-items: center; gap: 10px;">
        <span class="pin-label">S0</span>
        <button class="toggle-btn" data-pin="S0" style="z-index: 10;">${experimentState.inputs.S0}</button>
      </div>
      <div class="pin" style="position: absolute; top: 380px; left: 180px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
        <button class="toggle-btn" data-pin="E" style="z-index: 10;">${experimentState.inputs.E}</button>
        <span class="pin-label">${enLabel}</span>
      </div>
      <div class="pin" style="position: absolute; top: 75px; left: 330px; display: flex; align-items: center; gap: 10px;">
        <div class="led ${outs[0] ? 'on' : ''}"></div>
        <span class="pin-label">Y0</span>
      </div>
      <div class="pin" style="position: absolute; top: 135px; left: 330px; display: flex; align-items: center; gap: 10px;">
        <div class="led ${outs[1] ? 'on' : ''}"></div>
        <span class="pin-label">Y1</span>
      </div>
      <div class="pin" style="position: absolute; top: 195px; left: 330px; display: flex; align-items: center; gap: 10px;">
        <div class="led ${outs[2] ? 'on' : ''}"></div>
        <span class="pin-label">Y2</span>
      </div>
      <div class="pin" style="position: absolute; top: 255px; left: 330px; display: flex; align-items: center; gap: 10px;">
        <div class="led ${outs[3] ? 'on' : ''}"></div>
        <span class="pin-label">Y3</span>
      </div>
    </div>
  `;
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
  renderTruthTable();
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

function generateCircuitSVG(outs) {
  const { S1, S0, E } = experimentState.inputs;
  const enActive = experimentState.activeLowEnable ? E === 0 : E === 1;
  const NOT_S1 = S1 === 0 ? 1 : 0;
  const NOT_S0 = S0 === 0 ? 1 : 0;
  const cOutHigh = VAPORWAVE_COLORS.blue;
  const cOutLow = 'var(--muted)';
  const cS1_high = VAPORWAVE_COLORS.purple;
  const cS1_low = 'rgba(138, 43, 226, 0.3)';
  const cS0_high = VAPORWAVE_COLORS.blue;
  const cS0_low = 'rgba(0, 255, 255, 0.3)';
  const cE_high = VAPORWAVE_COLORS.orange;
  const cE_low = 'var(--muted)';
  const cS1 = S1 ? cS1_high : cS1_low;
  const cNS1 = NOT_S1 ? cS1_high : cS1_low;
  const cS0 = S0 ? cS0_high : cS0_low;
  const cNS0 = NOT_S0 ? cS0_high : cS0_low;
  const cE = enActive ? cE_high : cE_low;
  const show = experimentState.showCircuit;

  let svg = `
    <defs>
      <marker id="dotS1" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
        <circle cx="5" cy="5" r="5" fill="${cS1}"></circle>
      </marker>
      <marker id="dotS0" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
        <circle cx="5" cy="5" r="5" fill="${cS0}"></circle>
      </marker>
    </defs>
    <line x1="80" y1="120" x2="100" y2="120" stroke="${cS1}" stroke-width="3"></line>
    <line x1="80" y1="180" x2="100" y2="180" stroke="${cS0}" stroke-width="3"></line>
    <line x1="200" y1="380" x2="200" y2="350" stroke="${cE}" stroke-width="3"></line>
    <line x1="280" y1="90" x2="330" y2="90" stroke="${outs[0] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <line x1="280" y1="150" x2="330" y2="150" stroke="${outs[1] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <line x1="280" y1="210" x2="330" y2="210" stroke="${outs[2] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <line x1="280" y1="270" x2="330" y2="270" stroke="${outs[3] ? cOutHigh : cOutLow}" stroke-width="3"></line>
  `;

  if (!show) return svg;

  svg += `
    <circle cx="120" cy="120" r="4" fill="${cS1}"></circle>
    <line x1="100" y1="120" x2="140" y2="120" stroke="${cS1}" stroke-width="3"></line>
    <line x1="120" y1="140" x2="240" y2="140" stroke="${cS1}" stroke-width="3"></line>
    <circle cx="120" cy="140" r="4" fill="${cS1}"></circle>
    <circle cx="163" cy="120" r="3" fill="var(--surface)" stroke="${cS1}" stroke-width="2"></circle>
    <line x1="120" y1="120" x2="120" y2="260" stroke="${cS1}" stroke-width="3"></line>
    <line x1="120" y1="260" x2="240" y2="260" stroke="${cS1}" stroke-width="3"></line>
    <circle cx="120" cy="260" r="4" fill="${cS1}"></circle>
    <line x1="120" y1="200" x2="240" y2="200" stroke="${cS1}" stroke-width="3"></line>
    <circle cx="120" cy="200" r="4" fill="${cS1}"></circle>
    <path d="M 140 110 L 160 120 L 140 130 Z" fill="var(--surface)" stroke="${cS1}" stroke-width="2"></path>
    <line x1="166" y1="120" x2="180" y2="120" stroke="${cNS1}" stroke-width="3"></line>
    <line x1="180" y1="79" x2="180" y2="141" stroke="${cNS1}" stroke-width="3"></line>
    <circle cx="180" cy="140" r="4" fill="${cNS1}"></circle>
    <line x1="180" y1="140" x2="240" y2="140" stroke="${cNS1}" stroke-width="3"></line>
    <circle cx="180" cy="120" r="4" fill="${cNS1}"></circle>
    <line x1="180" y1="80" x2="240" y2="80" stroke="${cNS1}" stroke-width="3"></line>
    <circle cx="110" cy="180" r="4" fill="${cS0}"></circle>
    <line x1="100" y1="180" x2="140" y2="180" stroke="${cS0}" stroke-width="3"></line>
    <line x1="110" y1="149" x2="110" y2="271" stroke="${cS0}" stroke-width="3"></line>
    <line x1="110" y1="270" x2="240" y2="270" stroke="${cS0}" stroke-width="3"></line>
    <line x1="110" y1="150" x2="240" y2="150" stroke="${cS0}" stroke-width="3"></line>
    <line x1="190" y1="210" x2="240" y2="210" stroke="${cNS0}" stroke-width="3"></line>
    <line x1="190" y1="90" x2="190" y2="211" stroke="${cNS0}" stroke-width="3"></line>
    <line x1="190" y1="90" x2="240" y2="90" stroke="${cNS0}" stroke-width="3"></line>
    <path d="M 140 170 L 160 180 L 140 190 Z" fill="var(--surface)" stroke="${cS0}" stroke-width="2"></path>
    <circle cx="163" cy="180" r="3" fill="var(--surface)" stroke="${cS0}" stroke-width="2"></circle>
    <line x1="166" y1="180" x2="190" y2="180" stroke="${cNS0}" stroke-width="3"></line>
    <line x1="200" y1="100" x2="200" y2="350" stroke="${cE}" stroke-width="3"></line>
    <line x1="200" y1="100" x2="240" y2="100" stroke="${cE}" stroke-width="3"></line>
    <line x1="200" y1="160" x2="240" y2="160" stroke="${cE}" stroke-width="3"></line>
    <line x1="200" y1="220" x2="240" y2="220" stroke="${cE}" stroke-width="3"></line>
    <circle cx="200" cy="220" r="4" fill="${cE}"></circle>
    <line x1="200" y1="280" x2="240" y2="280" stroke="${cE}" stroke-width="3"></line>
    <circle cx="200" cy="280" r="4" fill="${cE}"></circle>
    <path d="M 240 70 L 260 70 A 20 20 0 0 1 260 110 L 240 110 Z" fill="var(--surface)" stroke="${outs[0] ? cOutHigh : cOutLow}" stroke-width="2"></path>
    <line x1="280" y1="90" x2="300" y2="90" stroke="${outs[0] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <circle cx="200" cy="160" r="4" fill="${cE}"></circle>
    <circle cx="110" cy="150" r="4" fill="${cS0}"></circle>
    <path d="M 240 130 L 260 130 A 20 20 0 0 1 260 170 L 240 170 Z" fill="var(--surface)" stroke="${outs[1] ? cOutHigh : cOutLow}" stroke-width="2"></path>
    <line x1="280" y1="150" x2="300" y2="150" stroke="${outs[1] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <circle cx="190" cy="210" r="4" fill="${cNS0}"></circle>
    <path d="M 240 190 L 260 190 A 20 20 0 0 1 260 230 L 240 230 Z" fill="var(--surface)" stroke="${outs[2] ? cOutHigh : cOutLow}" stroke-width="2"></path>
    <line x1="280" y1="210" x2="300" y2="210" stroke="${outs[2] ? cOutHigh : cOutLow}" stroke-width="3"></line>
    <circle cx="110" cy="270" r="4" fill="${cS0}"></circle>
    <path d="M 240 250 L 260 250 A 20 20 0 0 1 260 290 L 240 290 Z" fill="var(--surface)" stroke="${outs[3] ? cOutHigh : cOutLow}" stroke-width="2"></path>
    <line x1="280" y1="270" x2="300" y2="270" stroke="${outs[3] ? cOutHigh : cOutLow}" stroke-width="3"></line>
  `;
  return svg;
}
