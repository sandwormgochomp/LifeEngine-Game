# 🎨 Visual Art Critic Sandbox Critique Loop

This document outlines the standard workflow for iterating on pixel art and UI aesthetics in the LifeEngine codebase. It separates code implementation from visual critique by running an isolated art agent in a sandbox context.

---

## 🧭 The Core Principle
To protect the codebase from unintended side-effects and maintain clean separation of concerns:
1. **The Pixel Art Critic Subagent** is strictly read-only, has NO codebase context or code write permissions, and analyzes snapshots purely from an aesthetic standpoint (colors, lines, shading, curves, perspective).
2. **The Parent Developer Agent** translates the critic's visual/geometric feedback into mathematical code, manages file replacements, and runs screenshot/test commands. It does not ever run the full test suite during this loop.

IMPORTANT: This flow iterates until the art critic agent is happy with the result. If the art critic agent is unhappy with the result for any reason, the iterations continue.

---

## 🔄 Step-by-Step Workflow

```mermaid
graph TD
    A[1. Parent Reverts to Baseline] --> B[2. Parent Captures Screenshot]
    B --> C[3. Parent Spawns Isolated visual_art_critic]
    C --> D[4. Critic Inspects critique_snapshot.png]
    D --> E[5. Critic Reports Visual Issues]
    E --> F[6. Parent Translates Shading Specs to Code]
    F --> G[7. Parent Captures New Screenshot]
    G --> D
    D -- Nailed It! -- > H[8. Production Ready]
```

### 1. Revert to Baseline
Ensure the repository is in a clean state before starting a visual iteration.

### 2. Capture the Initial Screenshot
Use Playwright or another server-snapshot utility to save the layout rendering as a flat image:
```bash
npx playwright test tests/visual.spec.js --update-snapshots
cp tests/visual.spec.js-snapshots/main-dashboard-chromium-linux.png concepts/critique_snapshot.png
```

### 3. Define the `visual_art_critic` Subagent
Spawn an isolated subagent. The subagent definition **MUST** disable code/terminal permissions and instruct the LLM to behave purely as a retro pixel artist.

**System Prompt Blueprint:**
> *You are a legendary 16-bit retro pixel artist and game UI designer. Your job is to critique the visual aesthetics of simulator screenshots purely as a visual artist.*
> *You have NO access to the simulator's source code, so do not look at code files, do not discuss code structures, and do not make programming recommendations. Your critique must be strictly about the visual design (colors, shading, curves, perspective, dithering).*

### 4. Iterate on Feedback & Code Edits
*   **The Critic** reviews the image and identifies issues (e.g. jaggies, flat gradients, missing shadows, color mismatches).
*   **The Parent** edits the rendering files (e.g., `CellStates.ts`, `WorldEnvironment.ts`) to adjust circle math, dither patterns, and color values.
*   **The Parent** rebuilds/captures a fresh screenshot and sends it to the Critic.
*   Repeat until the Critic returns a **"Nailed It!"** sign-off.

---

## 🎨 Pixel Art & Shading Guidelines for LifeEngine
When implementing the critic's specs:
*   **Avoid Noisy Curves:** For thin curves, avoid checkerboard dithering; use clean concentric solid bands.
*   **Transition Dithering:** Apply a 50% checkerboard dither pattern (`((col + row) % 2 === 0)`) only to wide gradients (e.g., blending rim specular highlights into teals).
*   **Translucent Depth:** Use contrasting colors for floors (e.g., `#0a141d` glass floor) vs. shadow zones (`#020509` cast shadow) to create depth.
*   **Opposing Glows (Caustics):** Add refracting light caustics on the floor opposite the light source to simulate glass translucency.
