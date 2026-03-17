// Main application logic for Latches & Flip-Flops

window.appState = {
    clock: 0,
    clockMode: 'manual', // Start in manual mode
    clockInterval: null,
    data: 0,
    j: 0,
    k: 0,
    devices: {
        latch: { q: 0 },
        d_ff: { q: 0 },
        t_ff: { q: 0 },
        jk_ff: { q: 0 }
    }
};

let isInitialized = false;

function init() {
    if (isInitialized) return;
    isInitialized = true;
    console.log('init called');
    
    const clockModeBtn = document.getElementById('clock-mode-btn');
    const clockPulseBtn = document.getElementById('clock-pulse-btn');
    const clockIndicator = document.getElementById('clock-indicator');

    const dataBtn = document.getElementById('data-toggle-btn');
    const jBtn = document.getElementById('j-toggle-btn');
    const kBtn = document.getElementById('k-toggle-btn');

    const latchQ = document.getElementById('latch-q');
    const dffQ = document.getElementById('d-ff-q');
    const tffQ = document.getElementById('t-ff-q');
    const jkffQ = document.getElementById('jk-ff-q');

    function updateInputUI() {
        dataBtn.textContent = `D: ${window.appState.data}`;
        jBtn.textContent = `J: ${window.appState.j}`;
        kBtn.textContent = `K: ${window.appState.k}`;

        [dataBtn, jBtn, kBtn].forEach(btn => {
            const val = parseInt(btn.textContent.split(': ')[1]);
            if (val === 1) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function updateDeviceUI() {
        latchQ.textContent = `Q: ${window.appState.devices.latch.q}`;
        dffQ.textContent = `Q: ${window.appState.devices.d_ff.q}`;
        tffQ.textContent = `Q: ${window.appState.devices.t_ff.q}`;
        jkffQ.textContent = `Q: ${window.appState.devices.jk_ff.q}`;
    }

    function processLogic(isRisingEdge) {
        const state = window.appState;
        
        // Latch: Transparent when clock is 1
        if (state.clock === 1) {
            state.devices.latch.q = state.data;
        }

        // Flip-flops: Only update on rising edge
        if (isRisingEdge) {
            // D Flip-flop
            state.devices.d_ff.q = state.data;

            // T Flip-flop
            if (state.data === 1) {
                state.devices.t_ff.q = state.devices.t_ff.q === 0 ? 1 : 0;
            }

            // JK Flip-flop
            if (state.j === 0 && state.k === 1) {
                state.devices.jk_ff.q = 0;
            } else if (state.j === 1 && state.k === 0) {
                state.devices.jk_ff.q = 1;
            } else if (state.j === 1 && state.k === 1) {
                state.devices.jk_ff.q = state.devices.jk_ff.q === 0 ? 1 : 0;
            }
        }
        
        updateDeviceUI();
    }

    function updateClockUI() {
        clockIndicator.textContent = `CLK: ${window.appState.clock}`;
        if (window.appState.clock === 1) {
            clockIndicator.classList.add('high');
        } else {
            clockIndicator.classList.remove('high');
        }
    }

    function toggleClock() {
        const previousClock = window.appState.clock;
        window.appState.clock = previousClock === 0 ? 1 : 0;
        const isRisingEdge = previousClock === 0 && window.appState.clock === 1;
        updateClockUI();
        processLogic(isRisingEdge);
    }

    function setClockMode(mode) {
        window.appState.clockMode = mode;
        if (mode === 'auto') {
            clockModeBtn.textContent = 'Auto (1 Hz)';
            clockModeBtn.classList.add('active');
            clockPulseBtn.disabled = true;
            if (!window.appState.clockInterval) {
                window.appState.clockInterval = setInterval(toggleClock, 1000);
            }
        } else {
            clockModeBtn.textContent = 'Manual';
            clockModeBtn.classList.remove('active');
            clockPulseBtn.disabled = false;
            if (window.appState.clockInterval) {
                clearInterval(window.appState.clockInterval);
                window.appState.clockInterval = null;
            }
        }
    }

    clockModeBtn.addEventListener('click', () => {
        setClockMode(window.appState.clockMode === 'auto' ? 'manual' : 'auto');
    });

    clockPulseBtn.addEventListener('click', () => {
        if (window.appState.clockMode === 'manual') {
            toggleClock();
        }
    });

    dataBtn.addEventListener('click', () => {
        window.appState.data = window.appState.data === 0 ? 1 : 0;
        updateInputUI();
        processLogic(false); // Evaluate latch transparency
    });

    jBtn.addEventListener('click', () => {
        window.appState.j = window.appState.j === 0 ? 1 : 0;
        updateInputUI();
        processLogic(false);
    });

    kBtn.addEventListener('click', () => {
        window.appState.k = window.appState.k === 0 ? 1 : 0;
        updateInputUI();
        processLogic(false);
    });

    // Initialize UI
    setClockMode('manual');
    updateClockUI();
    updateInputUI();
    updateDeviceUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

