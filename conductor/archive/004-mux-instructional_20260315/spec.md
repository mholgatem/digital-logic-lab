# Specification - Mux Logic Tool Instructional Updates (Track 004)

## Overview
Enhance the Mux Logic Tool by adding an instructional speech bubble that guides students through the process of finding K-map symmetry and building multiplexer logic. The update includes layout adjustments to accommodate the new instructional UI and reactive logic to provide step-by-step feedback.

## Functional Requirements

### 1. Instructional Speech Bubble
- **Reactive Content:** The bubble must display context-aware instructions based on the current problem state:
    - **Initial State:** "Start by finding symmetry in the kmap. Click a line of symmetry to see the result."
    - **Symmetry Selected:** "Great! You chose symmetry on <axis>. When <axis> is <focus>, do we have symmetry? If so, what is the input value?"
    - **Invalid Axis:** "Uh-Oh! Looks like you are going to require more muxes than are available on this difficulty level. Lets undo that!"
- **Embedded Controls:** The bubble must contain:
    - **Input Buttons:** Display input options (A, B, C, 0, 1, etc.) inside the bubble for the student to select the symmetry result.
    - **Undo Button:** A surgical undo button specifically for axis selection, displayed when an invalid choice is made.
- **Positioning:** The bubble should appear as a "Contextual Popup" near the interaction area.

### 2. Layout Adjustments
- **K-map Pane Shift:** Move the K-map container left to make room for the speech bubble.
- **Implementation Detail:** Wrap the K-map pane in a transparent `div` that matches the size of the Mux visualization pane. Use horizontal flexbox (`justify-content: space-between` or similar) to space the K-map and the speech bubble.

### 3. Logic Preservation
- **Core Interactions:** Maintain all existing highlight and dimming effects in the K-map and Mux visualization. **Do not modify existing logic or styles** other than the layout container.

## Non-Functional Requirements
- **Theme Support:** The speech bubble and its contents must support both Light and Dark modes.
- **Animations:** Use smooth CSS transitions for the speech bubble's appearance and text changes.

## Acceptance Criteria
- Users receive clear, real-time guidance through each step of the Mux logic construction.
- The K-map layout remains centered/aligned relative to the Mux visualization while providing space for the instructions.
- The "Undo" button correctly reverts the last axis selection without disrupting the rest of the problem state.
- All existing visual feedback (highlights, dimming) remains fully functional.
