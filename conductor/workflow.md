# Workflow - Digital Logic Lab

This document defines the standard workflow for planning, implementing, and validating new features and modules in the Digital Logic Lab project.

## Planning & Feature Lifecycle

### 1. Research & Ideation
- Identify a digital logic concept for a new interactive tool.
- Research educational best practices and user needs (students, instructors, UGTAs).

### 2. Strategy & Design
- Create a new Track in `conductor/tracks/`.
- Draft a Specification (`spec.md`) and Implementation Plan (`plan.md`).
- Define the module's interactive behavior and UI/UX design.

### 3. Execution
- Follow the Plan Mode and Auto-Edit mode cycles for implementation.
- Adhere to the defined Tech Stack (Vanilla JS/HTML/CSS for initial tools).
- Maintain consistent UI patterns across modules.

### 4. Validation & Testing
- Empirically verify interactive behaviors (diagramming, minimization, etc.).
- Ensure correct data export (JSON, images, ZIP).
- Validate with real-world scenarios or instructor feedback.

### 5. Deployment
- Deploy the tool as a sub-path on GitHub Pages.
- Update the Tracks Registry to mark the track as completed.

## Development Standards
- **Vanilla First:** Prefer vanilla technologies for maximum flexibility and performance in an educational context.
- **Accessibility:** Prioritize keyboard navigation and screen-reader support for educational tools.
- **Modularity:** Keep different tools independent but consistent in design.
- **Diagnostic-Friendly:** Ensure designs are easy for instructors and UGTAs to verify.
