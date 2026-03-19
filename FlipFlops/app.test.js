const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlRaw = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
const html = htmlRaw.replace('<script src="app.js"></script>', '');
const scriptCode = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');

test('Clock Logic Tests', async (t) => {
    let dom;
    let window;
    let document;

    t.beforeEach(() => {
        dom = new JSDOM(html, { runScripts: "dangerously" });
        window = dom.window;
        document = window.document;
        // Inject script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = scriptCode;
        document.body.appendChild(scriptEl);

        // Trigger initialization
        const event = document.createEvent('Event');
        event.initEvent('DOMContentLoaded', true, true);
        window.document.dispatchEvent(event);
    });

    await t.test('Clock starts at 0 and manual mode', () => {
        const clockIndicator = document.getElementById('clock-indicator');
        assert.strictEqual(clockIndicator.textContent, 'CLK: 0');
        assert.strictEqual(window.appState.clock, 0);
    });

    await t.test('Manual pulse toggles clock', () => {
        const pulseBtn = document.getElementById('clock-pulse-btn');
        pulseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        assert.strictEqual(window.appState.clock, 1);
        const clockIndicator = document.getElementById('clock-indicator');
        assert.strictEqual(clockIndicator.textContent, 'CLK: 1');
    });

    await t.test('Auto mode toggles clock at 1 Hz', async () => {
        // Mock timers to test 1 Hz (1000ms) interval
        test.mock.timers.enable({ apis: ['setInterval'] });
        const autoBtn = document.getElementById('clock-mode-btn');
        autoBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        
        assert.strictEqual(window.appState.clockMode, 'auto');
        
        // Fast forward 1 second
        test.mock.timers.tick(1000);
        assert.strictEqual(window.appState.clock, 1);
        
        // Fast forward another 1 second
        test.mock.timers.tick(1000);
        assert.strictEqual(window.appState.clock, 0);

        test.mock.timers.reset();
    });
});