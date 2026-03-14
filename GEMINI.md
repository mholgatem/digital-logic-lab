# GEMINI.md - Digital Logic Lab

## Project Overview
Digital Logic Lab is a comprehensive suite of interactive, web-based tools designed to help students and instructors explore digital logic concepts. The project emphasizes a standardized UI, hosted accessibility (via GitHub Pages), and support for diagnostic/grading workflows.

### Main Modules
- **Finite State Machine (FSM) Designer:** Build and visualize state machines, export diagrams for documentation, and generate JSON files for automated grading.
- **Mux/Decoder/K-map Helpers:** (Planned) Interactive puzzles and visualizers for other digital logic components.

## Tech Stack
- **Frontend:** Vanilla HTML5, CSS3 (CSS Variables for theming), and JavaScript (ES6+).
- **Libraries:** Loaded via CDN (e.g., `html2canvas`, `jszip`).
- **Backend/Tooling:** Python 3 for the FSM autograder (`grade_fsm.py`).

## Getting Started

### Running the Web Tools
Since the project consists of static files, no build step is required. You can serve the project using any local web server:

```bash
# Using Python
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your browser.

### Automated Grading
To run the FSM autograder against a directory of student JSON exports:

```bash
python FiniteStateMachine/grade_fsm.py <path_to_json_files_directory>
```
The grader evaluates state descriptions, labels, binary values, diagram coverage, and transition table matches.

## Project Structure
- `/`: Landing page and core styles/logic.
- `/FiniteStateMachine`: Implementation of the FSM Designer tool and its autograder.
- `/conductor`: Project roadmap, specifications, and track-based development planning.

## Development Conventions

### Styling & Theming
- **CSS Variables:** Both the landing page and specific modules use CSS variables for colors and layout.
- **Dark Mode:** Supported via a `dark` class on the `<body>` element. Theme preference is persisted in a cookie (`dll_theme`).
- **Typography:** Uses the 'Inter' font family from Google Fonts.

### Architecture
- **Modularity:** Each tool is intended to live in its own subdirectory with its own `index.html`, `styles.css`, and `app.js`.
- **Statelessness:** Tools generally work by importing/exporting JSON data, facilitating easy sharing and grading without a complex backend.

### Conductor Integration
The project uses the `conductor` extension for managing development tracks. Refer to `conductor/tracks.md` for current progress and planned features.
