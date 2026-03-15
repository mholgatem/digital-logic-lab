# Implementation Plan - Decoder Games (Track 003)

## Phase 1: SVG Circuit Refactoring (Experiment Mode)
- [ ] Task: Refactor SVG generation to use persistent elements and CSS classes
    - [ ] Modify `renderExperimentMode` to only generate the static SVG skeleton once (if it doesn't exist)
    - [ ] Add unique IDs or classes to each SVG path and component (e.g., `cS1`, `cNS1`, `cS0`, `cNS0`, `cE`, `cOut0`, `cOut1`, `cOut2`, `cOut3`)
    - [ ] Implement `updateCircuitClasses()` to toggle CSS classes on SVG elements based on current input/output state
- [ ] Task: Define CSS classes for SVG signals in `styles.css`
    - [ ] Create `.signal-high` and `.signal-low` classes for different signal types (S1, S0, Enable, Outputs)
    - [ ] Ensure classes work correctly with both Dark and Light themes
- [ ] Task: Fix identified logic issues in `app.js`
    - [ ] Ensure all input combinations correctly trigger the `match-neon` effect in the truth table
- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Feature Completion & Persistence
- [ ] Task: Implement progress persistence
    - [ ] Use `localStorage` to save completed challenges or high scores within the existing `app.js` state
- [ ] Task: Enhance Challenge Mode UI
    - [ ] Improve the "OR Gate" visualization and pin selection for better clarity
    - [ ] Add animations or a celebratory effect for the "Challenge Complete" state
- [ ] Task: Refine SVG Circuit Visualization (Remaining Details)
    - [ ] Ensure all internal signal paths (not just the main inputs/outputs) are correctly highlighted for all combinations
    - [ ] Add tooltips or labels for internal components within the circuit view
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Final Integration & Accessibility
- [ ] Task: Final UI Polish & Aesthetic Refinement
    - [ ] Audit for Dark/Light mode contrast and theme consistency
    - [ ] Enhance the "Vaporwave" aesthetic with improved color palettes and SVG gradients
- [ ] Task: Accessibility Audit
    - [ ] Ensure all interactive buttons, selects, and toggles are keyboard-accessible and focus-visible
    - [ ] Add ARIA labels to SVG circuit components for screen reader support
- [ ] Task: Documentation & Cleanup
    - [ ] Add descriptive JSDoc comments to functions within `app.js`
    - [ ] Update README in the `DecoderGames/` folder with clear usage instructions
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
