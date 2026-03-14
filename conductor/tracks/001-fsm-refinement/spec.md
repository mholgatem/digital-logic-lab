# Specification - FSM Designer Refinement (Track 001)

## Overview
Refine the existing Finite State Machine (FSM) Designer to improve UX, fix known limitations, and align it with the broader "Digital Logic Lab" suite.

## User Stories
- **As a student**, I want a more intuitive way to manage transitions so I don't accidentally create overlapping arrows.
- **As a student**, I want POS (Product of Sums) support in K-maps so I can complete all parts of my lab assignments.
- **As a UGTA**, I want the tool to highlight common logic errors (e.g., missing transitions for certain input combinations).
- **As an instructor**, I want the exported JSON to be strictly compatible with the `grade_fsm.py` script.

## Key Refinements

### 1. UX/UI Enhancements
- **Arrow Management:** Improve the "blue dot" handle logic for curving arrows to prevent "jumpy" behavior.
- **Context Menus:** Replace native right-click with a custom, theme-aware context menu for states and arrows.
- **Onboarding:** Refine the coachmark sequence to be less intrusive but more helpful for first-time users.
- **Theming:** Ensure high contrast in Dark Mode, especially for K-map circles and transition labels.

### 2. Feature Additions
- **POS Mode in K-maps:** Enable the currently disabled POS selection in the K-map creation dialog.
- **Auto-Layout:** Add a simple "Arrange" button to automatically space out states in the diagram.
- **Consistency Verification:** Implement a "Verify" button that strictly checks if the **Transition Table** matches the **Transition Diagram**.
    - It will *not* highlight missing input combinations or unreachable states.
    - It will only report if the data entered in the table is consistent with the visual diagram.

### 3. Technical Debt & Compatibility
- **Refactor `app.js`:** Break down the 6,000+ line `app.js` into smaller, module-based files (e.g., `DiagramManager.js`, `KMapManager.js`, `StateStore.js`) to improve maintainability.
- **Grading Compatibility:** Audit the JSON export structure against `grade_fsm.py` requirements.

## Success Criteria
- K-maps support both SOP and POS modes.
- Real-time validation alerts the user to missing or non-deterministic transitions.
- `app.js` is refactored into at least 3 logical modules.
- The UI matches the "Digital Logic Lab" theme (to be defined in Track 006).
