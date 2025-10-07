# OmniLumen Visualizer

OmniLumen Visualizer is a browser-based playground for previewing Acolyte fixture photometry using Three.js. Load IES files from the sidebar, adjust light attributes, and inspect how the beam interacts with the virtual environment.

## Scene Controls

The **Scene Controls** card in the sidebar drives the currently selected light. In addition to the existing intensity, CCT, yaw, and pitch sliders, two new toggles are available:

- **Volumetrics** – renders a physically inspired volumetric cone that scales with the fixture's intensity and beam angle so you can see the beam cutting through space. When enabled, the **Density** slider adjusts the cone opacity (higher = thicker beam) and the **Falloff** slider tweaks distance attenuation (lower values carry further before fading).
- **Environment** – switch between the default open backdrop and a 5 m × 5 m × 3 m matte room with walls, floor, and ceiling panels. Use this to evaluate how fixtures paint onto surfaces versus floating in an empty scene.
- **Heatmap** – overlays an approximate illuminance heatmap on the floor for the selected light. The gradient updates live as you adjust intensity, color temperature, yaw, or pitch.

Both effects are lightweight shader-driven additions that respect the original Three.js renderer configuration and run in Replit without extra dependencies.
