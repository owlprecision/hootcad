# HootCAD Roadmap

## Vision

HootCAD's long-term ambition is to bring **professional software engineering workflows** to CAD:

- Source-controlled
- Scriptable
- Automatable
- Reviewable
- CI-friendly
- Extensible

This roadmap outlines our phased approach to building a CAD tool that treats design as software, not just geometry.

---

## Phase 1 — Core Rendering & Execution

**Goal:** Establish a reliable baseline for scripted CAD in HootCAD.

**Status:** ✅ Complete (v0.5)

- ✅ Get the `.jscad` execution pipeline working end-to-end
- ✅ Integrate the default JSCAD renderer/viewer
- ✅ Ensure stable execution, error handling, and reload behavior

This phase is about correctness and trust: if the core doesn't run predictably, nothing else matters.

---

## Phase 2 — Parameter UX

**Goal:** Make parametric models usable and explorable.

**Status:** 🔄 Planned

- Implement parameter discovery (`getParameterDefinitions`)
- Build parameter editing UI
- Enable live re-rendering on parameter changes

This is where models stop being "scripts" and start being *tools*.

---

## Phase 3 — Rendering Quality & Visual Aesthetics

**Goal:** Improve clarity, usability, and visual quality.

**Status:** 🔄 Planned

- Evaluate flexibility of the existing renderer
- Explore visual improvements (lighting, edges, grid, orientation cues)
- Investigate feasibility of:
  - Extending the current renderer, or
  - Introducing a custom renderer if constraints are too limiting

Rendering quality directly affects usability, confidence, and professional perception.

---

## Phase 4 — Export UX & Production Workflows

**Goal:** Make HootCAD outputs usable in real pipelines.

**Status:** 🔄 Planned

- Ensure reliable export of core formats (STL at minimum; others as feasible)
- Improve export UX (clear affordances, repeatability)
- Explore automation:
  - Headless export
  - CI-friendly export workflows
  - Deterministic builds for production use

This phase explicitly targets **professional and manufacturing workflows**, not just experimentation.

---

## Phase 5 — Introduce `.tscad` (TypeScript CAD)

**Goal:** Enable modern developer ergonomics and safer CAD authoring.

**Status:** 🔄 Planned

- Introduce `.tscad` as a first-class file type
- Provide:
  - Opinionated project scaffolding
  - Zero- or low-config TypeScript compilation
  - Strong typings and runtime bindings
- Focus on "pit of success" defaults:
  - Good IDE support
  - Predictable builds
  - Minimal setup friction

This phase treats CAD as *software*, not just geometry.

---

## Phase 6 — OpenCascade / B-rep Integration

**Goal:** Enable higher-fidelity CAD and manufacturing-grade geometry.

**Status:** 🔄 Planned

- Explore integrating OpenCascade (via OpenCascade.js or similar)
- Investigate coexistence with JSCAD workflows
- Enable STEP and other B-rep-friendly formats where feasible

This phase is intentionally later, once authoring and workflows are solid.

---

## Phase 7 — AI-Assisted & Agentic CAD Workflows

**Goal:** Enable AI-augmented professional workflows.

**Status:** 🔄 Planned

- Explore integration with GitHub Copilot and similar tools (e.g. Cursor)
- Investigate:
  - Generative CAD authoring
  - Refactoring-aware CAD code
  - Prompt-driven geometry exploration
- Emphasis on **professional workflows**, not novelty:
  - Source control
  - Reviewability
  - Determinism
  - Reproducibility

AI should *augment* skilled users, not replace understanding.

---

## Roadmap Notes

### This is a Living Document

This roadmap will evolve as the project grows and we learn from:
- User feedback
- Technical constraints
- Community contributions
- Ecosystem developments

### Contributions Welcome

We welcome contributions at all phases! If you're interested in working on a particular area:
1. Check existing issues for relevant discussions
2. Open a new issue to propose your approach
3. Submit a PR once you have a working implementation

### Sequencing is Flexible

While phases are numbered for clarity, some work may happen in parallel or out of order based on:
- Contributor interest
- Technical dependencies
- User demand
- Opportunity (e.g., upstream library improvements)

---

## Why This Matters

Traditional CAD tools treat design as opaque binary files. HootCAD embraces a different philosophy:

**Design is code. Code is design.**

By treating CAD as a software engineering problem, we unlock:
- Version control with meaningful diffs
- Automated testing and validation
- Reproducible builds
- Collaborative review workflows
- Integration with modern development tools

This roadmap charts the path from "a JSCAD viewer" to "a professional CAD authoring platform."

---

**Last Updated:** December 2024
