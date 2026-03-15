# Implementation Plan - Decoder Games (Track 003)

## Phase 1: SVG Circuit Refactoring (Experiment Mode)
- [x] Task: Refactor SVG generation to use persistent elements and CSS classes
    - [x] Modify `renderExperimentMode` to only generate the static SVG skeleton once (if it doesn't exist)
    - [x] Add unique IDs or classes to each SVG path and component (e.g., `cS1`, `cNS1`, `cS0`, `cNS0`, `cE`, `cOut0`, `cOut1`, `cOut2`, `cOut3`)
    - [x] Implement `updateCircuitClasses()` to toggle CSS classes on SVG elements based on current input/output state
- [x] Task: Define CSS classes for SVG signals in `styles.css`
    - [x] Create `.signal-high` and `.signal-low` classes for different signal types (S1, S0, Enable, Outputs)
    - [x] Ensure classes work correctly with both Dark and Light themes
- [x] Task: Fix identified logic issues in `app.js`
    - [x] Ensure all input combinations correctly trigger the `match-neon` effect in the truth table
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Challenge Mode Logic & UI Overhaul
- [ ] Task: Update Challenge Logic in `generateNewChallenge`
    - [ ] Ensure at least one active-low enable if minterm 0 is present
    - [ ] Ensure at least one active-high enable if minterm 7 is present
- [ ] Task: Refine Styles in `styles.css`
    - [ ] Remove neon glow (box-shadows/text-shadows) from all elements while keeping Vaporwave colors
- [ ] Task: Redesign Challenge UI Components in `app.js`
    - [ ] Draw the OR gate using SVG instead of CSS shapes
    - [ ] Redraw decoder blocks: smaller size, explicit lines for inputs/outputs, aligned labels
- [ ] Task: Refine SVG Circuit Visualization (Remaining Details)
    - [ ] Ensure all internal signal paths are correctly highlighted for all combinations
    - [ ] Add tooltips or labels for internal components within the circuit view
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Persistence, Accessibility & Final Integration
- [ ] Task: Implement progress persistence
    - [ ] Use `localStorage` to save completed challenges or high scores within the existing `app.js` state
- [ ] Task: Final UI Polish & Aesthetic Refinement
    - [ ] Audit for Dark/Light mode contrast and theme consistency
- [ ] Task: Accessibility Audit
    - [ ] Ensure all interactive buttons, selects, and toggles are keyboard-accessible and focus-visible
    - [ ] Add ARIA labels to SVG circuit components for screen reader support
- [ ] Task: Documentation & Cleanup
    - [ ] Add descriptive JSDoc comments to functions within `app.js`
    - [ ] Update README in the `DecoderGames/` folder with clear usage instructions
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
