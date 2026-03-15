# Specification - Decoder Games

## Overview
The Decoder Games module is an interactive learning tool designed to teach students binary-to-decimal decoding and combinational logic implementation using decoders. It features a Vaporwave color palette (neon orange, fuchsia, blue, purple) across both light and dark themes.

## Functional Requirements
- **Experiment Mode:**
    - Displays a 2-to-4 decoder.
    - Toggle between active-high and active-low enable.
    - Interactive inputs (select lines and enable) that light up output LEDs.
    - A dynamic truth table that includes a decimal value column; the active row highlights as inputs change.
    - **Analyze Circuit Option:** Reveals the full internal wiring diagram (NOT gates, crossing wires, and AND gates) inside the decoder, highlighting active paths dynamically based on inputs.
- **Challenge Mode:**
    - Generates a problem with two 2-to-4 decoders (random active-high/low enables) and a target boolean function `f(A, B, C)` defined by minterms.
    - Displays an OR gate with inputs equal to the number of target minterms.
    - **Wiring Interface:**
        - Decoder inputs and enables have dropdowns to select variables: A, B, or C.
        - OR gate inputs have dropdowns to select decoder outputs (Y0-Y3, Z0-Z3).
    - **Dynamic Truth Table Feedback:**
        - Displays an 8-row truth table for the 3-variable function.
        - Non-minterm rows are visually inactive (0.1 opacity).
        - As the user configures the circuit, if their wiring successfully generates a target minterm, the corresponding truth table row highlights in neon orange.

## Non-Functional Requirements
- Vaporwave color palette applied to UI elements, glowing effects, and wires.
- Matches the overarching Digital Logic Lab structure (header, settings, dark/light mode).
- Implemented with Vanilla HTML, CSS, and JS (SVG for wiring diagrams).

## Acceptance Criteria
- Experiment Mode accurately simulates a 2-to-4 decoder and reveals correct internal logic.
- Challenge Mode allows users to build a 3-variable function using two 2-to-4 decoders.
- The dynamic truth table correctly evaluates the user's current wiring configuration against the target minterms in real-time.