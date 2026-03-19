# Implementation Plan: Latches & Flip-Flop Helpers

## Phase 1: Core Setup & HTML Structure [checkpoint: 4d2c90c]
- [x] Task: Create `LatchesFlipFlops` directory, `index.html`, `styles.css`, and `app.js`.
- [x] Task: Set up the base HTML structure linking CSS and JS, and ensure responsive layout containers.
- [x] Task: Define the row container for the devices and basic placeholders for the Latch, D flip-flop, T flip-flop, and JK flip-flop.
- [x] Task: Create the global input controls (Clock Auto/Manual toggle, Common Data toggle, J toggle, K toggle).
- [x] Task: Conductor - User Manual Verification 'Core Setup & HTML Structure' (Protocol in workflow.md)

## Phase 2: Theming & Visual Styling [checkpoint: 5713888]
- [x] Task: Implement vaporwave CSS variables matching the Decoder Games.
- [x] Task: Style the global input controls (buttons/switches).
- [x] Task: Style the block symbols for the four devices, including the "Analyze circuit" buttons.
- [x] Task: Create CSS classes for active (glow + neon color) and inactive (dim) wires.
- [x] Task: Conductor - User Manual Verification 'Theming & Visual Styling' (Protocol in workflow.md)

## Phase 3: Logic Implementation & Interaction
- [x] Task: Write unit tests for Clock logic (auto mode timer at 1 Hz, manual increment).
- [x] Task: Implement Clock logic and state management.
- [x] Task: Write unit tests for the Latch logic and data toggle interactions. (Skipped per user request)
- [x] Task: Implement Latch logic.
- [x] Task: Write unit tests for D, T, and JK flip-flop logic based on inputs and clock state. (Skipped per user request)
- [x] Task: Implement D, T, and JK flip-flop logic.
- [x] Task: Connect global UI toggles to update internal logic states and device output states (Q).
- [x] Task: Conductor - User Manual Verification 'Logic Implementation & Interaction' (Protocol in workflow.md)

## Phase 4: Circuit Visualization (Modal Overlays)
- [x] Task: Write unit tests for modal overlay opening/closing logic. (Skipped per user request)
- [x] Task: Implement modal overlay structure in HTML/CSS.
- [x] Task: Create SVG or DOM-based representations of internal logic gates and wires for each device.
- [x] Task: Implement logic to dynamically apply active/inactive CSS classes to wires in the modal based on current device state.
- [x] Task: Conductor - User Manual Verification 'Circuit Visualization (Modal Overlays)' (Protocol in workflow.md)

## Phase 5: Timing Diagram
- [~] Task: Set up HTML5 Canvas element below the circuitry for the timing diagram.
- [ ] Task: Implement the data structure to track history of Clock, Data, and device Q outputs.
- [ ] Task: Write the rendering loop to draw the scrolling time window based on the history data.
- [ ] Task: Add UI controls allowing the user to select which device Q outputs to include in the diagram.
- [ ] Task: Conductor - User Manual Verification 'Timing Diagram' (Protocol in workflow.md)