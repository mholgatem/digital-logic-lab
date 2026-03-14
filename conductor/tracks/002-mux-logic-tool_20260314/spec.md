# Specification - Mux Logic Tool

## Overview
The **Mux Logic Tool** is an interactive educational module designed to help students visualize the relationship between Karnaugh map (K-map) symmetry and Multiplexers (Muxes). Students will split 3-variable K-maps along lines of symmetry, where each split corresponds to a Mux select line, to derive logic expressions visually.

## Functional Requirements
- **K-map Generation:**
    - Generate random 3-variable K-maps (variables A, B, and C).
    - Provide three difficulty levels: 1-Mux, 2-Mux, and 3-Mux problems.
- **Interactive Symmetry Selection:**
    - Users select lines of symmetry by clicking on grid lines or cell boundaries.
    - Selected lines are rendered as **bright, color-coded wavy lines**.
- **Visualization of Select Behavior:**
    - When a line of symmetry is selected (representing a Mux select line), the app helps visualize "what happens when select is 0" vs. "1".
    - The "active" portion of the K-map (the subset currently being analyzed) **pops out slightly**.
    - The "inactive" portion **darkens or fades out** to reduce distraction.
    - This process can be nested up to 3 times (for a 3-Mux problem).
- **Mux Diagram Visualization:**
    - A dynamic Mux diagram at the bottom of the screen updates as symmetry is selected.
    - The diagram highlights which portion of the K-map corresponds to each Mux input.
    - Colors of the Mux select lines match the corresponding wavy lines on the K-map.
- **Undo/Redo & Reset:**
    - Implement an **undo stack** accessible via a UI button and keyboard shortcuts (`Ctrl+Z` / `Cmd+Z`).
    - Provide a **Reset** button to clear all selections and restart the current problem.
- **Tutorial Mode:**
    - Include a guided tutorial or hint mode to assist students with their first symmetry selection and visualization.
- **Export:**
    - Support **Image Export (PNG)** of the K-map and Mux diagram using `html2canvas`.

## Non-Functional Requirements
- **Standardized UI:** Match the look and feel of the Digital Logic Lab suite (e.g., Finite State Machine Designer).
- **Vanilla Tech Stack:** Implementation using HTML5, CSS3, and Vanilla JavaScript.
- **Responsiveness:** Ensure the tool is usable on standard desktop and laptop screen sizes.

## Acceptance Criteria
- Students can successfully select lines of symmetry on a random 3-variable K-map.
- The K-map pop-out and fade-out animations correctly reflect the selected Mux inputs.
- The Mux diagram at the bottom correctly reflects the state of the K-map splits.
- Undo and Reset functions work as expected.
- Tutorial mode provides clear guidance for new users.
- PNG export produces a clear image of both the K-map and the Mux diagram.

## Out of Scope
- Support for more than 3 variables (4+ variable K-maps).
- Automated grading script (to be implemented in a separate track if needed).
- Complex logic minimization (e.g., Quine-McCluskey) beyond the visual Mux mapping.
