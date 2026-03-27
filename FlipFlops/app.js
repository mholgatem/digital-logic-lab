// ── State ──────────────────────────────────────────────────────────────
window.appState = {
  clock: 0,
  clockMode: 'manual',
  clockInterval: null,
  clockPhase: 3,   // starts at 3 so first tick wraps to 0 → CLK=0 first column
  j: 0,
  k: 0,
  analyzeMode: false,
  devices: {
    latch: { q: 0, d: 0 },
    d_ff:  { q: 0, d: 0, s: 0, r: 0 },
    t_ff:  { q: 0, t: 0, s: 0, r: 0 },
    jk_ff: { q: 0 }
  },
  history: []
};

// ── Cookie helpers (DecoderGames pattern) ─────────────────────────────
function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    expires = '; expires=' + d.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

function getCookie(name) {
  const eq = name + '=';
  for (let c of document.cookie.split(';')) {
    c = c.trim();
    if (c.indexOf(eq) === 0) return c.substring(eq.length);
  }
  return null;
}

const THEME_COOKIE = 'dll_theme';
const SIZE_COOKIE  = 'dll_circuit_size';

function applyCircuitSize(px) {
  document.querySelectorAll('.circuit-card').forEach(el => {
    el.style.minWidth = px + 'px';
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.remove('light');
  } else {
    document.body.classList.add('light');
    document.body.classList.remove('dark');
  }
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = (theme === 'dark');
}

// ── Logic ──────────────────────────────────────────────────────────────
function processLogic(isRisingEdge) {
  const s = window.appState;

  // D Latch: transparent when CLK=1
  if (s.clock === 1) {
    s.devices.latch.q = s.devices.latch.d;
  }

  // D Flip-Flop: async Set/Reset override; else edge-triggered
  if (s.devices.d_ff.s === 1) {
    s.devices.d_ff.q = 1;
  } else if (s.devices.d_ff.r === 1) {
    s.devices.d_ff.q = 0;
  } else if (isRisingEdge) {
    s.devices.d_ff.q = s.devices.d_ff.d;
  }

  // T Flip-Flop: async Set/Reset override; else edge-triggered
  if (s.devices.t_ff.s === 1) {
    s.devices.t_ff.q = 1;
  } else if (s.devices.t_ff.r === 1) {
    s.devices.t_ff.q = 0;
  } else if (isRisingEdge) {
    if (s.devices.t_ff.t === 1) s.devices.t_ff.q ^= 1;
  }

  // JK Flip-Flop: edge-triggered
  if (isRisingEdge) {
    const { j, k } = s;
    if (j === 1 && k === 0) {
      s.devices.jk_ff.q = 1;
    } else if (j === 0 && k === 1) {
      s.devices.jk_ff.q = 0;
    } else if (j === 1 && k === 1) {
      s.devices.jk_ff.q ^= 1;
    }
    // j=0, k=0: hold
  }
}

// ── Render helpers ─────────────────────────────────────────────────────
function setHigh(id, active) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('high', !!active);
}

function setHighAll(ids, active) {
  ids.forEach(id => setHigh(id, active));
}

// ── Bus render ─────────────────────────────────────────────────────────
function renderBus() {
  const { clock } = window.appState;
  const clkIds = ['bus-clk', 'bus-clk-d0', 'bus-clk-d1', 'bus-clk-d2', 'bus-clk-d3'];
  setHighAll(clkIds, clock);
}

// ── Per-device circuit wire render ─────────────────────────────────────
function renderLatchCircuit() {
  const { clock } = window.appState;
  const { d: data, q } = window.appState.devices.latch;
  const notD = data ^ 1;
  const sBar = !(data & clock) ? 1 : 0;  // active low when D&CLK
  const rBar = !(notD & clock) ? 1 : 0;

  setHigh('latch-w-d',         data);
  setHigh('latch-w-d-branch',  data);
  setHigh('latch-w-clk',       clock);
  setHigh('latch-w-clk-n1',    clock);
  setHigh('latch-w-clk-n2',    clock);
  setHigh('latch-w-notd',      notD);
  // sBar=1 means gate output is high (NAND output)
  setHigh('latch-w-sbar',      sBar);  // high when driving SR
  setHigh('latch-w-rbar',      rBar);
  setHigh('latch-w-q',         q);
  setHigh('latch-w-qfb',       q);
  setHigh('latch-w-qbarfb',    q ^ 1);
  setHigh('latch-w-qbar',     q ^ 1);
}

function renderDffCircuit() {
  const { clock } = window.appState;
  const { d: data, q } = window.appState.devices.d_ff;
  const clkInv = clock ^ 1;

  setHigh('dff-w-d',       data);
  setHigh('dff-w-clk',     clock);
  setHigh('dff-w-clkinv',  clkInv);
  setHigh('dff-w-clkinv2', clkInv);
  setHigh('dff-w-clk2',    clock);
  setHigh('dff-w-mq',      q);   // master output tracks Q on rising
  setHigh('dff-w-q',       q);
}

function renderTffCircuit() {
  const { clock } = window.appState;
  const { t: data, q } = window.appState.devices.t_ff;
  const xorOut = data ^ q;

  setHigh('tff-w-t',       data);
  setHigh('tff-w-clk',     clock);
  setHigh('tff-w-xorout',  xorOut);
  setHigh('tff-w-q',       q);
  setHigh('tff-w-qfb',     q);
}

function renderJkffCircuit() {
  const { clock, j, k } = window.appState;
  const q    = window.appState.devices.jk_ff.q;
  const qBar = q ^ 1;
  const kInv = k ^ 1;
  const jAnd = j & qBar;
  const kAnd = kInv & q;
  const orOut = jAnd | kAnd;

  setHigh('jkff-w-j',      j);
  setHigh('jkff-w-k',      k);
  setHigh('jkff-w-kinv',   kInv);
  setHigh('jkff-w-clk',    clock);
  setHigh('jkff-w-clk2',   clock);
  setHigh('jkff-w-jand',   jAnd);
  setHigh('jkff-w-kand',   kAnd);
  setHigh('jkff-w-or',     orOut);
  setHigh('jkff-w-q',      q);
  setHigh('jkff-w-qfb',    q);
  setHigh('jkff-w-qbarfb', qBar);
}

// ── Symbol wire render (shown when analyze=off) ─────────────────────────
function renderSymbols() {
  const { clock, j, k } = window.appState;
  const { latch, d_ff, t_ff, jk_ff } = window.appState.devices;

  // D Latch
  setHigh('latch-sym-d',   latch.d);
  setHigh('latch-sym-clk', clock);
  setHigh('latch-sym-q',   latch.q);

  // D-FF
  setHigh('dff-sym-d',   d_ff.d);
  setHigh('dff-sym-clk', clock);
  setHigh('dff-sym-q',   d_ff.q);
  setHigh('dff-sym-s',   d_ff.s);
  setHigh('dff-sym-r',   d_ff.r);

  // T-FF
  setHigh('tff-sym-d',   t_ff.t);
  setHigh('tff-sym-clk', clock);
  setHigh('tff-sym-q',   t_ff.q);
  setHigh('tff-sym-s',   t_ff.s);
  setHigh('tff-sym-r',   t_ff.r);

  // JK-FF
  setHigh('jkff-sym-j',   j);
  setHigh('jkff-sym-clk', clock);
  setHigh('jkff-sym-k',   k);
  setHigh('jkff-sym-q',   jk_ff.q);
}

// ── Q output indicators ────────────────────────────────────────────────
function renderOutputs() {
  const s = window.appState;
  const devs = s.devices;

  const map = [
    ['latch', devs.latch.q],
    ['dff',   devs.d_ff.q],
    ['tff',   devs.t_ff.q],
    ['jkff',  devs.jk_ff.q]
  ];

  map.forEach(([pfx, q]) => {
    const led = document.getElementById(pfx + '-led');
    const val = document.getElementById(pfx + '-q-val');
    if (led) led.classList.toggle('q-on', !!q);
    if (val) val.textContent = q;
  });

  // D Latch mode label
  const modeLabel = document.getElementById('latch-mode');
  if (modeLabel) {
    const transparent = s.clock === 1;
    modeLabel.textContent = transparent ? 'Transparent Mode' : 'Memory Mode';
    modeLabel.classList.toggle('transparent', transparent);
  }
}

// ── Toolbar / CLK render ───────────────────────────────────────────────
function renderClockUI() {
  const { clock } = window.appState;
  const indicator = document.getElementById('clock-indicator');
  const led       = document.getElementById('clk-led');
  if (indicator) indicator.textContent = 'CLK: ' + clock;
  if (led) led.classList.toggle('on', !!clock);
}

function renderInputBtns() {
  const { j, k } = window.appState;
  const { latch, d_ff, t_ff } = window.appState.devices;

  const latchDBtn = document.getElementById('latch-d-btn');
  const dffDBtn   = document.getElementById('dff-d-btn');
  const tffTBtn   = document.getElementById('tff-t-btn');
  const jBtn      = document.getElementById('j-toggle-btn');
  const kBtn      = document.getElementById('k-toggle-btn');
  const dffSBtn   = document.getElementById('dff-s-btn');
  const dffRBtn   = document.getElementById('dff-r-btn');
  const tffSBtn   = document.getElementById('tff-s-btn');
  const tffRBtn   = document.getElementById('tff-r-btn');

  if (latchDBtn) { latchDBtn.textContent = latch.d; latchDBtn.classList.toggle('active', !!latch.d); }
  if (dffDBtn)   { dffDBtn.textContent   = d_ff.d;  dffDBtn.classList.toggle('active',   !!d_ff.d);  }
  if (tffTBtn)   { tffTBtn.textContent   = t_ff.t;  tffTBtn.classList.toggle('active',   !!t_ff.t);  }

  if (jBtn) {
    jBtn.textContent = j;
    jBtn.classList.toggle('active', !!j);
  }

  if (kBtn) {
    kBtn.textContent = k;
    kBtn.classList.toggle('active', !!k);
  }

  if (dffSBtn) { dffSBtn.textContent = d_ff.s; dffSBtn.classList.toggle('active', !!d_ff.s); }
  if (dffRBtn) { dffRBtn.textContent = d_ff.r; dffRBtn.classList.toggle('active', !!d_ff.r); }
  if (tffSBtn) { tffSBtn.textContent = t_ff.s; tffSBtn.classList.toggle('active', !!t_ff.s); }
  if (tffRBtn) { tffRBtn.textContent = t_ff.r; tffRBtn.classList.toggle('active', !!t_ff.r); }
}

// ── Full render ────────────────────────────────────────────────────────
function render() {
  renderClockUI();
  renderInputBtns();
  renderBus();
  renderSymbols();
  renderLatchCircuit();
  renderDffCircuit();
  renderTffCircuit();
  renderJkffCircuit();
  renderOutputs();
  renderTiming();
}

// ── Clock control ──────────────────────────────────────────────────────
function toggleClock() {
  const prev = window.appState.clock;
  window.appState.clock ^= 1;
  const risingEdge = (prev === 0 && window.appState.clock === 1);
  processLogic(risingEdge);
  appendHistory();
  render();
}

// Auto-mode tick: advances one column every 500 ms.
// CLK stays low for 2 columns then high for 2 columns: _ _ - - _ _ - -
function tickClock() {
  const s = window.appState;
  s.clockPhase = (s.clockPhase + 1) % 4;
  const newClk = s.clockPhase >= 2 ? 1 : 0;   // phases 0,1 → low; 2,3 → high
  if (newClk !== s.clock) {
    s.clock = newClk;
    processLogic(newClk === 1);               // risingEdge only when going high
  }
  appendHistory();
  render();
}

function setClockMode(mode) {
  window.appState.clockMode = mode;

  const modeBtn  = document.getElementById('clock-mode-btn');
  const pulseBtn = document.getElementById('clock-pulse-btn');

  if (mode === 'auto') {
    if (modeBtn) { modeBtn.textContent = 'Auto 1Hz'; modeBtn.classList.add('active'); }
    if (pulseBtn) pulseBtn.disabled = true;
    if (!window.appState.clockInterval) {
      window.appState.clockInterval = setInterval(tickClock, 500);
    }
  } else {
    if (modeBtn) { modeBtn.textContent = 'Manual'; modeBtn.classList.add('active'); }
    if (pulseBtn) pulseBtn.disabled = false;
    if (window.appState.clockInterval) {
      clearInterval(window.appState.clockInterval);
      window.appState.clockInterval = null;
    }
  }
}

// ── History / Timing ───────────────────────────────────────────────────
function makeSnapshot() {
  const s = window.appState;
  return {
    clk:  s.clock,
    w:    s.clockMode === 'manual' ? 2 : 1,
    d_l:  s.devices.latch.d,
    d_d:  s.devices.d_ff.d,
    d_t:  s.devices.t_ff.t,
    j:    s.j,
    k:    s.k,
    q_l:  s.devices.latch.q,
    q_d:  s.devices.d_ff.q,
    q_t:  s.devices.t_ff.q,
    q_jk: s.devices.jk_ff.q
  };
}

// Always push a new column (used by clock edges)
function appendHistory() {
  const s = window.appState;
  s.history.push(makeSnapshot());
  if (s.history.length > 64) s.history.shift();
}

// D / J / K changes overwrite the current column so the timing diagram shows
// the live input state within each clock phase without adding extra columns
function updateLastHistory() {
  const s = window.appState;
  if (s.history.length === 0) { appendHistory(); return; }
  s.history[s.history.length - 1] = makeSnapshot();
}

// Per-card timing constants
const T_ROW_H  = 18;
const T_LABEL  = 24;
const T_SAMPLE = 16;
const T_PAD_V  = 3;

function renderCardTiming(svgId, rows, edgeType) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  // Compute how many samples fit in the card width (each sample carries its own width)
  const card    = svg.closest('.circuit-card');
  const cardW   = card ? card.clientWidth : 200;
  const drawW   = Math.max(cardW - 2, 80);                    // SVG viewBox width ≈ card width

  // Walk backwards through history, accumulating pixel widths, until we fill the diagram
  const hist    = window.appState.history;
  const maxDraw = drawW - T_LABEL;
  let totalW = 0, start = hist.length;
  while (start > 0) {
    const w = (hist[start - 1].w || 1) * T_SAMPLE;
    if (totalW + w > maxDraw) break;
    totalW += w;
    start--;
  }
  const slice = hist.slice(start);
  const n     = slice.length;

  // Precompute x positions as a cumulative sum so each sample uses its own width
  const xPos = [T_LABEL];
  for (let i = 0; i < n; i++) xPos.push(xPos[i] + (slice[i].w || 1) * T_SAMPLE);

  const totalH = rows.length * T_ROW_H + T_PAD_V * 2;

  svg.setAttribute('viewBox', `0 0 ${drawW} ${totalH}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', totalH);
  svg.removeAttribute('preserveAspectRatio');

  const cs    = getComputedStyle(document.body);
  const bg    = cs.getPropertyValue('--surface').trim() || '#fff';
  const fgMut = cs.getPropertyValue('--muted').trim()   || '#888';
  const fgBrd = cs.getPropertyValue('--border').trim()  || '#ccc';

  let html = `<rect width="${drawW}" height="${totalH}" fill="${bg}"/>`;

  // Edge marker lines — drawn first so they appear behind all waveforms
  if (edgeType && n > 1) {
    const yTop = T_PAD_V + 3;                                          // yHigh of CLK row
    const yBot = T_PAD_V + (rows.length - 1) * T_ROW_H + T_ROW_H - 3; // yLow of Q row
    for (let i = 1; i < n; i++) {
      const prevClk = slice[i - 1].clk;
      const currClk = slice[i].clk;
      const rising  = prevClk === 0 && currClk === 1;
      const falling = prevClk === 1 && currClk === 0;
      if (rising || (edgeType === 'both' && falling)) {
        const x = xPos[i];
        html += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="rgba(128,128,128,0.4)" stroke-width="1" stroke-dasharray="3,3"/>`;
      }
    }
  }

  rows.forEach((row, ri) => {
    const y0    = T_PAD_V + ri * T_ROW_H;
    const yMid  = y0 + T_ROW_H / 2;
    const yHigh = y0 + 3;
    const yLow  = y0 + T_ROW_H - 3;

    html += `<line x1="0" y1="${y0 + T_ROW_H}" x2="${drawW}" y2="${y0 + T_ROW_H}" stroke="${fgBrd}" stroke-width="0.5"/>`;
    // Label is always pinned to the left column — unaffected by scrolling
    html += `<text x="${T_LABEL - 2}" y="${yMid}" text-anchor="end" dominant-baseline="middle"
      font-family="Inter,monospace" font-size="8" font-weight="700" fill="${fgMut}">${row.label}</text>`;
    html += `<line x1="${T_LABEL}" y1="${y0}" x2="${T_LABEL}" y2="${y0 + T_ROW_H}" stroke="${fgBrd}" stroke-width="0.5"/>`;

    if (n === 0) return;

    let d = '';
    for (let i = 0; i < n; i++) {
      const x  = xPos[i];
      const xN = xPos[i + 1];
      const val = slice[i][row.key];
      const y   = val ? yHigh : yLow;

      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevY = slice[i - 1][row.key] ? yHigh : yLow;
        if (val !== slice[i - 1][row.key]) {
          d += ` L ${x} ${prevY} L ${x} ${y}`;
        }
      }
      d += ` L ${xN} ${y}`;
    }

    html += `<path d="${d}" stroke="${row.color}" stroke-width="1.5" fill="none" stroke-linecap="square"/>`;
  });

  // Hover-highlight regions — drawn last so pointer events land on top of waveforms
  if (edgeType && n > 0) {
    const bounds = [];
    let rStart = xPos[0];
    for (let i = 1; i < n; i++) {
      const prevClk = slice[i - 1].clk;
      const currClk = slice[i].clk;
      const isEdge  = edgeType === 'both'
        ? prevClk !== currClk
        : (prevClk === 0 && currClk === 1);
      if (isEdge) {
        bounds.push([rStart, xPos[i]]);
        rStart = xPos[i];
      }
    }
    bounds.push([rStart, xPos[n]]);  // final region to end of last sample
    bounds.forEach(([x0, x1]) => {
      if (x1 > x0) html += `<rect class="timing-region" x="${x0}" y="0" width="${x1 - x0}" height="${totalH}"/>`;
    });
  }

  svg.innerHTML = html;
}

function renderTiming() {
  renderCardTiming('timing-latch', [
    { key: 'clk', label: 'C', color: 'var(--vw-orange)' },
    { key: 'd_l', label: 'D', color: 'var(--vw-blue)'   },
    { key: 'q_l', label: 'Q', color: 'var(--vw-purple)' }
  ], 'both');
  renderCardTiming('timing-dff', [
    { key: 'clk', label: 'C', color: 'var(--vw-orange)' },
    { key: 'd_d', label: 'D', color: 'var(--vw-blue)'   },
    { key: 'q_d', label: 'Q', color: 'var(--vw-purple)' }
  ], 'rising');
  renderCardTiming('timing-tff', [
    { key: 'clk', label: 'C', color: 'var(--vw-orange)' },
    { key: 'd_t', label: 'T', color: 'var(--vw-blue)'   },
    { key: 'q_t', label: 'Q', color: 'var(--vw-purple)' }
  ], 'rising');
  renderCardTiming('timing-jkff', [
    { key: 'clk',  label: 'C', color: 'var(--vw-orange)'  },
    { key: 'j',    label: 'J', color: 'var(--vw-green)'   },
    { key: 'k',    label: 'K', color: 'var(--vw-fuchsia)' },
    { key: 'q_jk', label: 'Q', color: 'var(--vw-purple)'  }
  ], 'rising');
}

// ── Info bubble ────────────────────────────────────────────────────────
const INFO_TEXT = {
  'card-latch': 'When in TRANSPARENT mode, Q output is exactly the same as D input.\n\nWhen in MEMORY mode, Q holds on to its current value.',
  'card-dff':   'On the rising edge of the clock, Q will take on the last stable value of D.\n\nR and S will immediately set the value of Q to 0 or 1, respectively.',
  'card-tff':   "On the rising edge of the clock, if T is a stable 1, then the value of Q will toggle (Q becomes Q').",
  'card-jkff':  "When J&K are both 0, Q holds its current value.\n\nWhen J&K are both 1, Q will toggle (Q becomes Q').\n\nWhen J&K are different from each other (0&1 or 1&0), Q will always equal J."
};

function escHtml(s) {
  return s.replace(/&/g, '&amp;');
}

// ── Initialization ─────────────────────────────────────────────────────
let isInitialized = false;

function init() {
  if (isInitialized) return;
  isInitialized = true;

  // Info bubble shared state
  const infoBubble = document.getElementById('info-bubble');
  let infoBubbleTimer = null;

  // Theme
  const savedTheme = getCookie(THEME_COOKIE) || 'light';
  applyTheme(savedTheme);

  // Circuit size
  const sizeSlider = document.getElementById('circuitSizeSlider');
  const savedSize  = getCookie(SIZE_COOKIE);
  const size = savedSize !== null ? savedSize : 0;
  if (sizeSlider) sizeSlider.value = size;
  if (savedSize !== null) applyCircuitSize(size);
  if (sizeSlider) {
    sizeSlider.addEventListener('input', () => {
      applyCircuitSize(sizeSlider.value);
      setCookie(SIZE_COOKIE, sizeSlider.value, 365);
    });
  }

  // Settings dialog
  const settingsBtn  = document.getElementById('settingsBtn');
  const settingsDlg  = document.getElementById('settingsDialog');
  const closeSettings = document.getElementById('closeSettings');
  const darkToggle   = document.getElementById('darkModeToggle');

  if (settingsBtn && settingsDlg) {
    settingsBtn.addEventListener('click', () => settingsDlg.classList.remove('hidden'));
  }
  if (closeSettings && settingsDlg) {
    closeSettings.addEventListener('click', () => settingsDlg.classList.add('hidden'));
  }
  if (settingsDlg) {
    settingsDlg.addEventListener('click', e => {
      if (e.target === settingsDlg) settingsDlg.classList.add('hidden');
    });
  }
  if (darkToggle) {
    darkToggle.addEventListener('change', () => {
      const theme = darkToggle.checked ? 'dark' : 'light';
      applyTheme(theme);
      setCookie(THEME_COOKIE, theme, 365);
    });
  }

  // Clock mode toggle
  const clockModeBtn = document.getElementById('clock-mode-btn');
  if (clockModeBtn) {
    clockModeBtn.addEventListener('click', () => {
      setClockMode(window.appState.clockMode === 'auto' ? 'manual' : 'auto');
    });
  }

  // Clock pulse
  const clockPulseBtn = document.getElementById('clock-pulse-btn');
  if (clockPulseBtn) {
    clockPulseBtn.addEventListener('click', () => {
      if (window.appState.clockMode === 'manual') toggleClock();
    });
  }

  // D Latch input toggle
  const latchDBtn = document.getElementById('latch-d-btn');
  if (latchDBtn) {
    latchDBtn.addEventListener('click', () => {
      window.appState.devices.latch.d ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }

  // D Flip-Flop input toggle
  const dffDBtn = document.getElementById('dff-d-btn');
  if (dffDBtn) {
    dffDBtn.addEventListener('click', () => {
      window.appState.devices.d_ff.d ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }

  // T Flip-Flop input toggle
  const tffTBtn = document.getElementById('tff-t-btn');
  if (tffTBtn) {
    tffTBtn.addEventListener('click', () => {
      window.appState.devices.t_ff.t ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }

  // J toggle
  const jBtn = document.getElementById('j-toggle-btn');
  if (jBtn) {
    jBtn.addEventListener('click', () => {
      window.appState.j ^= 1;
      updateLastHistory();
      render();
    });
  }

  // K toggle
  const kBtn = document.getElementById('k-toggle-btn');
  if (kBtn) {
    kBtn.addEventListener('click', () => {
      window.appState.k ^= 1;
      updateLastHistory();
      render();
    });
  }

  // D-FF Set/Reset
  const dffSBtn = document.getElementById('dff-s-btn');
  if (dffSBtn) {
    dffSBtn.addEventListener('click', () => {
      window.appState.devices.d_ff.s ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }
  const dffRBtn = document.getElementById('dff-r-btn');
  if (dffRBtn) {
    dffRBtn.addEventListener('click', () => {
      window.appState.devices.d_ff.r ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }

  // T-FF Set/Reset
  const tffSBtn = document.getElementById('tff-s-btn');
  if (tffSBtn) {
    tffSBtn.addEventListener('click', () => {
      window.appState.devices.t_ff.s ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }
  const tffRBtn = document.getElementById('tff-r-btn');
  if (tffRBtn) {
    tffRBtn.addEventListener('click', () => {
      window.appState.devices.t_ff.r ^= 1;
      processLogic(false);
      updateLastHistory();
      render();
    });
  }

  // Analyze Circuits toggle
  const analyzeBtn = document.getElementById('analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      window.appState.analyzeMode = !window.appState.analyzeMode;
      document.body.classList.toggle('analyze-on', window.appState.analyzeMode);
      analyzeBtn.classList.toggle('active', window.appState.analyzeMode);
      analyzeBtn.textContent = window.appState.analyzeMode ? 'Hide Circuits' : 'Analyze Circuits';
      clearTimeout(infoBubbleTimer);
      if (infoBubble) infoBubble.classList.add('hidden');
    });
  }

  // Symbol SVG info bubbles (shown after 1.5 s hover)
  if (infoBubble) {
    document.querySelectorAll('.symbol-svg').forEach(svg => {
      const card = svg.closest('.circuit-card');
      if (!card) return;
      const text = INFO_TEXT[card.id];
      if (!text) return;

      svg.addEventListener('mouseenter', () => {
        infoBubbleTimer = setTimeout(() => {
          infoBubble.innerHTML = escHtml(text).split('\n').join('<br>');
          infoBubble.classList.remove('hidden');
          const r = svg.getBoundingClientRect();
          infoBubble.style.left = (r.left + r.width / 2) + 'px';
          infoBubble.style.top  = (r.bottom + 8) + 'px';
        }, 1500);
      });

      svg.addEventListener('mouseleave', () => {
        clearTimeout(infoBubbleTimer);
        infoBubble.classList.add('hidden');
      });
    });
  }

  // Initial render
  setClockMode('auto');
  appendHistory();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
