# Implementation Plan - Decoder Games

## Phase 1: Scaffolding & Vaporwave Theme
- [ ] Task: Create module directory `/DecoderGames/` with `index.html`, `styles.css`, and `app.js`.
- [ ] Task: Set up the base layout, navigation, and dark/light mode toggle.
- [ ] Task: Implement the Vaporwave color palette CSS variables and base styling.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding' (Protocol in workflow.md)

## Phase 2: Experiment Mode & Internal Logic
- [ ] Task: Implement the 2-to-4 decoder interactive UI (inputs, enable toggle, output LEDs).
- [ ] Task: Create the interactive 2-to-4 truth table with decimal values mapping to the UI state.
- [ ] Task: Build the 'Analyze Circuit' SVG view with NOT/AND gates and crossover wiring.
- [ ] Task: Implement dynamic active-path highlighting for the internal SVG wires.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Experiment Mode' (Protocol in workflow.md)

## Phase 3: Challenge Mode Engine & UI
- [ ] Task: Implement the problem generator (target function `f`, minterms, random decoder enable types).
- [ ] Task: Build the Challenge Mode UI (two decoders, OR gate, input dropdowns for A, B, C and Y0-Z3).
- [ ] Task: Render the 8-row target truth table with inactive dimming for non-minterms.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Challenge Mode UI' (Protocol in workflow.md)

## Phase 4: Dynamic Circuit Evaluation
- [ ] Task: Write the evaluation logic to compute the truth table of the user's wired circuit in real-time.
- [ ] Task: Implement the neon orange highlighting logic for matched minterm rows.
- [ ] Task: Add completion state/feedback when the user successfully builds the full function.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Dynamic Evaluation' (Protocol in workflow.md)