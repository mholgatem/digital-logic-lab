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

## Phase 3: Logic Implementation & Interaction [checkpoint: c77ee9b]
- [x] Task: Write unit tests for Clock logic (auto mode timer at 1 Hz, manual increment).
- [x] Task: Implement Clock logic and state management.
- [x] Task: Write unit tests for the Latch logic and data toggle interactions. (Skipped per user request)
- [x] Task: Implement Latch logic.
- [x] Task: Write unit tests for D, T, and JK flip-flop logic based on inputs and clock state. (Skipped per user request)
- [x] Task: Implement D, T, and JK flip-flop logic.
- [x] Task: Connect global UI toggles to update internal logic states and device output states (Q).
- [x] Task: Conductor - User Manual Verification 'Logic Implementation & Interaction' (Protocol in workflow.md)

## Phase 4: Circuit Visualization (Modal Overlays) [checkpoint: b81384e]
- [x] Task: Write unit tests for modal overlay opening/closing logic. (Skipped per user request)
- [x] Task: Implement modal overlay structure in HTML/CSS.
- [x] Task: Create SVG or DOM-based representations of internal logic gates and wires for each device.
- [x] Task: Implement logic to dynamically apply active/inactive CSS classes to wires in the modal based on current device state.
- [x] Task: Conductor - User Manual Verification 'Circuit Visualization (Modal Overlays)' (Protocol in workflow.md)

## Phase 5: Full Visual Redesign (DecoderGames Aesthetic)
- [x] Task: Rewrite index.html — sticky header, toolbar, bus layer, 4 inline circuit cards, timing section, settings dialog.
- [x] Task: Rewrite styles.css — DecoderGames CSS variables, signal wire classes (sig-clk/d/j/k/q/internal), circuit cards, bus layer, timing section.
- [x] Task: Rewrite app.js — processLogic (unchanged), per-device circuit wire render, SVG timing diagram (8 signal rows, history[] up to 64 samples), theme cookie, settings dialog.
- [x] Task: Bus layer SVG — CLK (orange) bus to all 4 cards, D (cyan) bus to first 3 cards.
- [x] Task: Symbol SVGs per card — IEEE-style rectangular blocks with animated wire stubs.
- [x] Task: Circuit SVGs per card — D Latch (INV+2NAND+SR), D-FF (master-slave), T-FF (XOR+DFF), JK-FF (AND/OR+DFF).
- [x] Task: Analyze Circuits global toggle — body.analyze-on class switches all 4 cards simultaneously.
- [x] Task: SVG timing trace — 8 rows (CLK/D/J/K/Q_L/Q_D/Q_T/Q_JK), color-coded, scrolling waveform.
- [x] Task: Conductor - User Manual Verification 'Full Visual Redesign' (Protocol in workflow.md)