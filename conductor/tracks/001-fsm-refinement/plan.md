# Implementation Plan - FSM Designer Refinement (Track 001)

## Phase 1: Research & Audit
- [x] Audit `grade_fsm.py` to identify all required JSON fields and validation rules.
    - **Required Fields:** `states` (with `description`, `label`, `binary`), `transitions`, `inputs`, `outputs`, `numStates`, `transitionTable`, `kmaps`.
    - **Validation Rules:** Uniqueness of binary codes, state usage in transitions, K-map completeness vs. transition table, expression minimality.
- [ ] Research best practices for vanilla JS module organization (using ES modules).
- [ ] Identify and document the current "blue dot" handle logic issues in `app.js`.

## Phase 2: Refactoring & Architecture
- [ ] Set up a modular file structure in `FiniteStateMachine/src/`:
    - `state-store.js` (Manages `states`, `transitions`, `inputs`, `outputs`)
    - `diagram-manager.js` (SVG rendering, dragging, arrow logic)
    - `kmap-manager.js` (K-map logic, SOP/POS minimization)
    - `ui-controller.js` (Dialog management, toolbars, coachmarks)
    - `validator.js` (Real-time validation logic matching `grade_fsm.py`)
- [ ] Migrating logic from `app.js` to new modules iteratively.
- [ ] Implement a central `App` class or event bus for module communication.

## Phase 3: UX/UI & Features
- [ ] Implement POS (Product of Sums) mode for K-maps.
- [ ] Enhance arrow curving/snapping logic (fix "jumpy" blue dots).
- [ ] Create custom theme-aware context menus.
- [ ] Implement Consistency Verification: Strictly verify that the Transition Table entries match the Transition Diagram connections.

## Phase 4: Compatibility & Verification
- [ ] Update JSON export to ensure 100% compatibility with `grade_fsm.py`.
- [ ] Conduct end-to-end testing of the refactored and enhanced tool.
- [ ] Update documentation to reflect the new features and modular architecture.
