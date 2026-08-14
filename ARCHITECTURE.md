# 🧭 PathFinder AI — Codebase Architecture

This document serves as a high-level map of the codebase. It is designed to help AI coding agents (and humans) quickly understand how files and components interact without needing to scan every file, saving context window tokens.

---

## 🗺️ System Overview

The system consists of a **FastAPI backend** (Python) that handles data sorting and LLM extraction, and a **Vite + React frontend** (JavaScript) providing a dark glassmorphic user interface.

```mermaid
graph TD
    subgraph Frontend [React Frontend]
        App[App.jsx] --> Landing[Landing.jsx]
        App --> Onboarding[Onboarding.jsx]
        App --> Dashboard[Dashboard.jsx]
        Onboarding & Dashboard --> API[api.js]
    end

    subgraph Backend [FastAPI Backend]
        API -- HTTP Proxy --> Main[main.py]
        Main --> Models[models.py]
        Main --> LLM[llm_service.py]
        Main --> Engine[path_engine.py]
        Engine --> Data[backend/data/*]
    end
```

---

## 📦 Core Components & Communities

### 1. Path Recommendations Engine (`backend/path_engine.py`)
- **Purpose**: Parses clean datasets and constructs the prerequisite graph.
- **Key Methods**:
  - `PathEngine.generate_path(domain, target_skill_id, known_skills)`: Runs a topological sort on prerequisite chains.
  - `PathEngine.recommend_courses_for_skill(skill_id)`: Selects best-rated courses matching the skill.
  - `PathEngine.build_learning_plan(...)`: Generates full step-by-step milestone recommendations.

### 2. FastAPI Endpoints (`backend/main.py`)
- `/api/chat-intake` (POST): Passes free-text goals to `llm_service.py` to extract domain & skill fields.
- `/api/profile` (POST): Registers the learner profile.
- `/api/path` (POST): Triggers path generation via `PathEngine`.
- `/api/explain` (POST): Generates customized, grounded explanations for recommendations using `llm_service.py`.
- `/api/progress` (POST): Updates marked-off milestones and recalculates the remaining path.

### 3. LLM Wrapper Service (`backend/llm_service.py`)
- **Model**: `llama-3.3-70b-versatile` (via Groq API).
- **Functions**:
  - `extract_intake_json(...)`: Uses system prompt constraints to force JSON outputs matching only valid skills in our graph.
  - `explain_recommendation(...)`: Grinds explanations from the exact prerequisite chain to prevent hallucinations.

### 4. React Frontend (`frontend/src/`)
- `api.js`: Standardized helper using relative paths mapped to the Vite development server proxy.
- `index.css`: Implementation of the custom design system (dark glassmorphism, glowing borders, custom typography).
- `pages/Dashboard.jsx`: Coordinates milestones, updating progress trackers, and rendering course chips.
