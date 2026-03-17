# Specification: Latches & Flip-Flop Helpers

## Overview
A new interactive laboratory module for Digital Logic Lab (EEE 120). This module focuses on Latches and Flip-Flops, allowing students to experiment with and visualize the behavior of fundamental sequential logic circuits.

## Functional Requirements
- **Devices:** Include a Latch, D flip-flop, T flip-flop, and JK flip-flop in a single row. (RS flip-flop is intentionally excluded).
- **Inputs:**
  - **Common Clock Line:** Connected to all devices. Features an auto-mode (1 Hz) and a manual mode.
  - **Common Data Line:** Connected to the Latch, D flip-flop, and T flip-flop (manual toggle).
  - **Dedicated J & K Inputs:** Connected only to the JK flip-flop (manual toggles).
- **Visualization (Circuit):**
  - By default, devices are displayed as simple block symbols.
  - An "Analyze circuit" option opens a modal overlay displaying the internal logic gates and wires of the selected device.
- **Visual Cues:**
  - Wires maintain the vaporwave color scheme (neon orange, hot pink, hot blue, neon green, neon purple) matching the decoder games.
  - Active wires are highlighted using CSS classes to apply the neon color and a glow effect. Inactive wires are dimmed.
- **Timing Diagram:**
  - Positioned below the circuitry, rendered using HTML5 Canvas.
  - Displays a scrolling time window of the progressing circuits.
  - Users can select which circuit's timing diagrams to include (multiple allowed).
  - Output is restricted to 'Q' (excluding 'Q\'').
  - The diagram avoids duplicating the common clock and data lines.

## Non-Functional Requirements
- **Styling:** Adhere to the existing vaporwave theme and CSS variable approach.
- **Responsiveness:** Ensure the modal overlays and timing diagrams adapt gracefully to screen dimensions.

## Acceptance Criteria
- [ ] Latch, D, T, and JK flip-flops are functional and respond to the clock and inputs.
- [ ] Clock auto-mode toggles at 1 Hz, and manual mode increments on click.
- [ ] "Analyze circuit" correctly opens a modal showing the accurate underlying logic gates.
- [ ] Wires glow and apply correct neon colors when active, and dim when inactive.
- [ ] The timing diagram accurately reflects the state changes of selected 'Q' outputs and inputs over a scrolling time window.

## Out of Scope
- RS flip-flops.
- Complex state machine generation from these helpers.
- Exporting the timing diagram as an image (unless requested later).