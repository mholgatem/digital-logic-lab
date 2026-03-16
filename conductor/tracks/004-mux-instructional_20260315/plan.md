# Implementation Plan - Mux Logic Tool Instructional Updates (Track 004)

## Phase 1: Layout & Style Scaffolding
- [x] Task: Create the Instructional Speech Bubble component
    - [x] Add `#instructionalContainer` and `#speechBubble` to `index.html`
    - [x] Wrap the K-map container in the requested transparent `div` for layout alignment
    - [x] Define styles for the speech bubble in `styles.css` (Dark/Light mode, pointer, positioning)
- [x] Task: Adjust K-map pane layout
    - [x] Update `.workspace` and related containers to use horizontal flexbox for the top row
    - [x] Ensure the K-map container shifts left while maintaining alignment with the Mux visualization below
- [~] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Instructional Logic & Reactive Text
- [ ] Task: Implement the Instruction Manager in `app.js`
    - [ ] Create `updateInstructions()` function to set text and controls based on `currentState`
    - [ ] Integrate `updateInstructions()` into existing interaction handlers (`initEventListeners`, `generateNewProblem`, `renderSymmetry`)
- [ ] Task: Implement context-aware messages
    - [ ] Add logic for "Initial State" instructions
    - [ ] Add logic for "Symmetry Selected" instructions (including axis and focus variables)
    - [ ] Add logic for "Invalid Selection" (too many muxes)
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Embedded Controls & Undo Logic
- [ ] Task: Add interactive elements to the speech bubble
    - [ ] Dynamically render input option buttons (A, B, C, 0, 1) inside the bubble
    - [ ] Implement the surgical Undo button for axis selections
- [ ] Task: Refine Logic Preservation
    - [ ] Audit all existing highlights and dimming effects to ensure they are unaffected by layout changes
    - [ ] Final polish of animations and transitions for the bubble
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
