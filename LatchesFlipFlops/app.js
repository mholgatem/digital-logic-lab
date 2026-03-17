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

    // Modal logic
    const modal = document.getElementById('analyze-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalTitle = document.getElementById('modal-title');
    const circuitVis = document.getElementById('circuit-visualization');
    let currentAnalyzingDevice = null;

    const circuitSVGs = {
        'latch': `
            <svg width="400" height="200" viewBox="0 0 400 200">
                <!-- Inputs -->
                <text x="10" y="50" class="gate-text">D</text>
                <text x="10" y="150" class="gate-text">CLK</text>
                
                <!-- Wires -->
                <path id="w-d" class="wire inactive color-blue" d="M 30,45 L 100,45 L 100,60 L 150,60" />
                <path id="w-not-d" class="wire inactive color-pink" d="M 100,45 L 100,100 L 150,100" />
                <path id="w-clk1" class="wire inactive color-green" d="M 40,145 L 120,145 L 120,80 L 150,80" />
                <path id="w-clk2" class="wire inactive color-green" d="M 120,145 L 120,120 L 150,120" />
                <path id="w-s" class="wire inactive color-orange" d="M 210,70 L 250,70" />
                <path id="w-r" class="wire inactive color-orange" d="M 210,110 L 250,110" />
                <path id="w-q" class="wire inactive color-purple" d="M 330,90 L 380,90" />
                
                <!-- Gates -->
                <!-- AND 1 -->
                <rect x="150" y="50" width="60" height="40" class="gate-symbol" />
                <text x="180" y="75" text-anchor="middle" class="gate-text">AND</text>
                <!-- NOT -->
                <circle cx="140" cy="100" r="5" class="gate-symbol" />
                <!-- AND 2 -->
                <rect x="150" y="90" width="60" height="40" class="gate-symbol" />
                <text x="180" y="115" text-anchor="middle" class="gate-text">AND</text>
                
                <!-- SR Latch -->
                <rect x="250" y="50" width="80" height="80" class="gate-symbol" />
                <text x="290" y="95" text-anchor="middle" class="gate-text">SR LATCH</text>
                <text x="390" y="95" class="gate-text">Q</text>
            </svg>
        `,
        'd-ff': `
            <svg width="400" height="200" viewBox="0 0 400 200">
                <text x="50%" y="50%" text-anchor="middle" class="gate-text">D Flip-Flop Circuit</text>
                <!-- Simplified for now -->
                <path id="w-d-ff-in" class="wire inactive color-blue" d="M 50,100 L 150,100" />
                <path id="w-d-ff-clk" class="wire inactive color-green" d="M 50,150 L 150,150" />
                <path id="w-d-ff-q" class="wire inactive color-purple" d="M 250,100 L 350,100" />
                <rect x="150" y="70" width="100" height="100" class="gate-symbol" />
                <text x="200" y="125" text-anchor="middle" class="gate-text">D-FF</text>
            </svg>
        `,
        't-ff': `
            <svg width="400" height="200" viewBox="0 0 400 200">
                <text x="50%" y="50%" text-anchor="middle" class="gate-text">T Flip-Flop Circuit</text>
                <path id="w-t-ff-in" class="wire inactive color-blue" d="M 50,100 L 150,100" />
                <path id="w-t-ff-clk" class="wire inactive color-green" d="M 50,150 L 150,150" />
                <path id="w-t-ff-q" class="wire inactive color-purple" d="M 250,100 L 350,100" />
                <rect x="150" y="70" width="100" height="100" class="gate-symbol" />
                <text x="200" y="125" text-anchor="middle" class="gate-text">T-FF</text>
            </svg>
        `,
        'jk-ff': `
            <svg width="400" height="200" viewBox="0 0 400 200">
                <text x="50%" y="50%" text-anchor="middle" class="gate-text">JK Flip-Flop Circuit</text>
                <path id="w-jk-j" class="wire inactive color-blue" d="M 50,80 L 150,80" />
                <path id="w-jk-k" class="wire inactive color-pink" d="M 50,120 L 150,120" />
                <path id="w-jk-clk" class="wire inactive color-green" d="M 50,160 L 150,160" />
                <path id="w-jk-q" class="wire inactive color-purple" d="M 250,100 L 350,100" />
                <rect x="150" y="50" width="100" height="120" class="gate-symbol" />
                <text x="200" y="115" text-anchor="middle" class="gate-text">JK-FF</text>
            </svg>
        `
    };

    function renderCircuit(device) {
        circuitVis.innerHTML = circuitSVGs[device] || '';
    }

    function setWireState(id, isActive) {
        const wire = document.getElementById(id);
        if (wire) {
            if (isActive) {
                wire.classList.add('active');
                wire.classList.remove('inactive');
            } else {
                wire.classList.add('inactive');
                wire.classList.remove('active');
            }
        }
    }

    function updateModalWires() {
        if (!currentAnalyzingDevice) return;
        
        const state = window.appState;
        
        if (currentAnalyzingDevice === 'latch') {
            const d = state.data;
            const clk = state.clock;
            const notD = d === 0 ? 1 : 0;
            const s = (d === 1 && clk === 1) ? 1 : 0;
            const r = (notD === 1 && clk === 1) ? 1 : 0;
            const q = state.devices.latch.q;

            setWireState('w-d', d === 1);
            setWireState('w-not-d', notD === 1);
            setWireState('w-clk1', clk === 1);
            setWireState('w-clk2', clk === 1);
            setWireState('w-s', s === 1);
            setWireState('w-r', r === 1);
            setWireState('w-q', q === 1);
        } else if (currentAnalyzingDevice === 'd-ff') {
            setWireState('w-d-ff-in', state.data === 1);
            setWireState('w-d-ff-clk', state.clock === 1);
            setWireState('w-d-ff-q', state.devices.d_ff.q === 1);
        } else if (currentAnalyzingDevice === 't-ff') {
            setWireState('w-t-ff-in', state.data === 1);
            setWireState('w-t-ff-clk', state.clock === 1);
            setWireState('w-t-ff-q', state.devices.t_ff.q === 1);
        } else if (currentAnalyzingDevice === 'jk-ff') {
            setWireState('w-jk-j', state.j === 1);
            setWireState('w-jk-k', state.k === 1);
            setWireState('w-jk-clk', state.clock === 1);
            setWireState('w-jk-q', state.devices.jk_ff.q === 1);
        }
    }

    function openModal(device) {
        currentAnalyzingDevice = device;
        const deviceNames = {
            'latch': 'Latch',
            'd-ff': 'D Flip-Flop',
            't-ff': 'T Flip-Flop',
            'jk-ff': 'JK Flip-Flop'
        };
        modalTitle.textContent = `${deviceNames[device]} Circuit Analysis`;
        renderCircuit(device);
        updateModalWires();
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
        currentAnalyzingDevice = null;
        circuitVis.innerHTML = '';
    }

    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.querySelectorAll('.analyze-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            openModal(e.target.dataset.device);
        });
    });

    // Update processLogic to also update modal wires
    const originalProcessLogic = processLogic;
    processLogic = function(isRisingEdge) {
        originalProcessLogic(isRisingEdge);
        updateModalWires();
    };

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

