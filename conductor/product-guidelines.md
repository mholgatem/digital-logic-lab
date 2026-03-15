# Product Guidelines - Digital Logic Lab

## Prose & Tone
- **Educational/Friendly:** Use clear, encouraging language that helps students understand complex concepts without being overly formal.
- **Instructional:** Provide step-by-step guidance for interactive tools to minimize the learning curve.

## UX & UI Design
- **Visual Clarity:** Prioritize high contrast for text, diagrams, and interactive elements.
- **Theming:** Support both Dark and Light modes consistently across all modules using CSS variables.
- **Micro-interactions:** Use subtle animations and visual feedback to indicate state changes or successful actions.
- **Consistency:** Maintain a unified look and feel by using the 'Inter' font and standardized spacing.

## Accessibility
- **Keyboard Navigation:** Ensure all interactive elements (buttons, inputs, canvas nodes) are fully accessible via Tab and keyboard shortcuts.
- **Visual Contrast:** Adhere to WCAG guidelines for color contrast to support users with low vision.

## Development Standards
- **Modular Architecture:** Organize the project into independent subdirectories for each module (e.g., `/FiniteStateMachine`, `/DecoderGames`).
- **Vanilla First:** Prefer vanilla HTML, CSS, and JavaScript for core logic to ensure long-term maintainability and zero-installation ease.
- **Clean Code:** Use descriptive variable names, modular functions, and consistent formatting.
- **Statelessness:** Design modules to work primarily with imported/exported JSON data to facilitate easy sharing and grading.
