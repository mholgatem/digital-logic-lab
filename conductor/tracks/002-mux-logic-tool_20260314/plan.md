# Implementation Plan - Mux Logic Tool

## Phase 1: Scaffolding & Core Layout
- [ ] Task: Create module directory `/MuxLogicTool/` with `index.html`, `styles.css`, and `app.js`.
- [ ] Task: Set up a basic HTML layout with a header, K-map container, Mux diagram container, and toolbar.
- [ ] Task: Integrate basic theme support (dark/light mode) to match the project's root `styles.css`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding' (Protocol in workflow.md)

## Phase 2: K-map Generation & Rendering
- [ ] Task: Implement a K-map generator for 3 variables (A, B, C) that produces random truth tables.
- [ ] Task: Render the 3-variable K-map as a grid in the UI.
- [ ] Task: Implement difficulty levels (1, 2, or 3 Muxes) to control the complexity of the generated K-map.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: K-map Generation' (Protocol in workflow.md)

## Phase 3: Interactive Symmetry Selection
- [ ] Task: Implement click-to-select logic for grid lines and cell boundaries to define symmetry.
- [ ] Task: Develop a "wavy line" renderer using SVG or Canvas for selected symmetry lines.
- [ ] Task: Implement color-coding for symmetry lines.
- [ ] Task: Create an **Undo Stack** to manage symmetry selections (Ctrl+Z / Cmd+Z support).
- [ ] Task: Add a **Reset** button to clear all selections.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Interactive Symmetry' (Protocol in workflow.md)

## Phase 4: Mux Visualization Logic
- [ ] Task: Implement logic to track the "active" subset of the K-map based on symmetry splits.
- [ ] Task: Develop CSS/JS animations for the "pop-out" (active) and "fade-out" (inactive) effects.
- [ ] Task: Create a dynamic Mux diagram component that updates as symmetry is selected.
- [ ] Task: Ensure Mux select colors match the K-map symmetry lines.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Mux Visualization' (Protocol in workflow.md)

## Phase 5: Tutorial & Export
- [ ] Task: Implement a "Tutorial/Hint" mode to guide students through a sample problem.
- [ ] Task: Integrate `html2canvas` for PNG export of the K-map and Mux diagram.
- [ ] Task: Final UI polish, ensuring consistent styling with the rest of the Digital Logic Lab suite.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Tutorial & Export' (Protocol in workflow.md)
