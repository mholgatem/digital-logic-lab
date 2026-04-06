# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Digital Logic Lab** is a static, vanilla JavaScript educational platform for EEE120 (Digital Logic Fundamentals). It has five self-contained modules hosted via GitHub Pages. Since there is no build step, all code must run directly in the browser — no server-side logic, no bundling.

Modules:
- `DecoderGames/` — Binary decoder puzzles (experiment + challenge modes)
- `FlipFlops/` — Latch and flip-flop simulation with SVG circuit visualization
- `MuxLogicTool/` — K-map to multiplexer decomposition puzzle
- `FiniteStateMachine/` — Full FSM designer (most complex; ~6000+ line `app.js`)
- K-map Visualizer — Planned, not yet implemented

## Development

No build process. Serve statically and open in a browser:

```bash
# Any static server works, e.g.:
npx serve .
python -m http.server 8080
```

The only package dependency is `jsdom` (used for FlipFlops tests):
```bash
npm install
node --experimental-vm-modules node_modules/.bin/jest FlipFlops/app.test.js
```

There are no linters or CI checks configured. GitHub Actions deploys to GitHub Pages on push.

## Architecture

### Module Structure

Each module is fully self-contained: one `index.html`, one `app.js`, one `styles.css`. Modules share no code between them — utility functions like `setCookie`/`getCookie`/`applyTheme`/`initTheme` are duplicated in each module's `app.js`.

### Theme System

All modules share the same dark/light mode pattern:
- Toggled via `document.body.classList.toggle('dark')`
- Persisted in a cookie named `dll_theme` (365 days)
- CSS variables are defined on `:root` (light) and overridden in `body.dark` (dark)

### Vaporwave Color Palette

Defined as CSS variables in each module's `styles.css`:
```css
--vw-orange:  #FF5E00
--vw-fuchsia: #FF00FF
--vw-blue:    #00FFFF
--vw-purple:  #8A2BE2
--vw-green:   #39FF14
--vw-red:     #FF2D55
```
These are used for signal lines, highlights, interactive elements, and diagram accents.

### FiniteStateMachine Module

The FSM module is significantly more complex than others. Key concepts:

**Global `state` object** is the single source of truth. It contains `states[]`, `transitions[]`, `transitionTable`, `kmaps[]`, machine type (`'moore'`|`'mealy'`), inputs/outputs arrays, etc. Rendering is always driven from this object.

**Playmat (SVG canvas):** States are `<circle>` elements inside `<g class="state-group">`. Transitions are SVG `<path>` elements. The main render cycle is `renderDiagram()` → `drawState()` / `drawTransition()`. Path shapes use `quadraticPath()` for normal transitions and `selfLoopPath()` for self-referential ones.

**Interaction model on the SVG:**
- Drag state → move it
- Ctrl+Drag state → resize it
- Alt+Drag or Right-click+Drag from state → draw new transition
- Drag arc handle → reshape transition curve
- Shift+Drag or Middle-click+Drag → pan canvas
- Scroll → zoom

**Undo/redo:** `saveSnapshot()` pushes to `undoStack` before any mutation; `undo()` restores.

**Coachmarks (onboarding hints):** Triggered by user actions; seen-state stored in `localStorage` with keys prefixed `fsm_onboarding_*`.

**Export:** Uses `html2canvas` (CDN) for PNG exports of tables/diagrams, and `jszip` (CDN) to bundle K-map exports.

**Dialogs:** All dialogs share a pattern — `.dialog-backdrop` with `.hidden` toggle, click-outside-to-close on the backdrop element itself.

## Code Style

Follow the Google JavaScript and HTML/CSS style guides (see `conductor/code_styleguides/`). Key rules:

- **JS:** `const` by default, `let` if reassigned, no `var`. Single quotes for strings. Semicolons required. 2-space indentation. `===`/`!==` always. `lowerCamelCase` for functions/variables.
- **CSS:** Hyphenated class names (e.g., `.state-node`), alphabetized declarations, no `!important`, no ID selectors for styling.
- **HTML:** Double quotes for attributes, 2-space indentation, omit `type` on `<script>`/`<link>`.

When editing an existing file, match its existing style above all else.

## Conductor Directory

`conductor/` contains project planning, specs, and style guides managed by the Gemini conductor agent. Do not edit files in `conductor/` — treat them as read-only reference material.
