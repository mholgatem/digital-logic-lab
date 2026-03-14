# Specification - Main Landing Page & Global Theme (Track 000)

## Overview
Create a central entry point for the "Digital Logic Lab" project. This landing page hosts links to all interactive learning modules and manages global settings, specifically the "Dark Mode" theme, persistent across all modules.

## Key Features
- **Module Hub**: Visual cards for Live (FSM Designer) and Planned (Mux, Decoder, K-map, etc.) modules.
- **Global Settings**: Dark Mode toggle saved via `dll_theme` cookie.
- **Theme Persistence**: Sub-modules read the cookie on load to apply the user's preferred theme.

## Status
**Completed**: Main hub implemented at project root. Theme synchronization integrated into FSM Designer.
