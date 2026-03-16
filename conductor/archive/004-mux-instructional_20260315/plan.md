# Implementation Plan - Mux Logic Tool Instructional Updates (Track 004)

## Phase 1: Layout & Style Scaffolding [checkpoint: 03c67fd]
- [x] Task: Create the Instructional Speech Bubble component
    - [x] Add `#instructionalContainer` and `#speechBubble` to `index.html`
    - [x] Wrap the K-map container in the requested transparent `div` for layout alignment
    - [x] Define styles for the speech bubble in `styles.css` (Dark/Light mode, pointer, positioning)
- [x] Task: Adjust K-map pane layout
    - [x] Update `.workspace` and related containers to use horizontal flexbox for the top row
    - [x] Ensure the K-map container shifts left while maintaining alignment with the Mux visualization below
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Instructional Logic & Reactive Text [checkpoint: 83c556b]
- [x] Task: Implement the Instruction Manager in `app.js`
    - [x] Create `updateInstructions()` function to set text and controls based on `currentState`
    - [x] Integrate `updateInstructions()` into existing interaction handlers (`initEventListeners`, `generateNewProblem`, `renderSymmetry`)
- [x] Task: Implement context-aware messages
    - [x] Add logic for "Initial State" instructions
    - [x] Add logic for "Symmetry Selected" instructions (including axis and focus variables)
    - [x] Add logic for "Invalid Selection" (too many muxes)
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Advanced Logic & UI Refinements
- [x] Task: UI & Message Polish
    - [x] Update `#bubbleControls` styles (max-width 200px, 2-row layout)
    - [x] Organize bubble buttons: A', B', C', 0 (Row 1) and A, B, C, 1 (Row 2)
    - [x] Polished message transitions (remove "Great!" after initial selection)
- [x] Task: Implement "All Possible Solutions" solver and real-time verification
    - [x] Create `findAllSolutions` logic to pre-calculate all valid Mux trees for the problem
    - [x] Update `currentState` to include `validSolutions`
    - [x] Update `generateNewProblem` to run the solver
    - [x] Update `updateInstructions` to:
        - [x] Filter `validSolutions` based on current user selections/inputs
        - [x] Provide "You require more muxes" error if axis deviates from all possible valid solutions
        - [x] Provide "That's not a solution" error if input choice deviates from valid options for current axes
- [x] Task: Enhanced Logic Validation (Legacy - superseded by solver task)
    - [x] Implement immediate unsolvability detection for axis selections
    - [x] Add logic for "Need another mux" encouragement
    - [x] Implement full truth-table verification of the solution before success message
    - [x] Add "Incorrect Solution" state with reset button
- [~] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
