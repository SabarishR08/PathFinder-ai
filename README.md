# 🧭 PathFinder AI

An AI-powered personalized learning path recommender built on real course data and a deterministic graph engine.

## Live Demo
**Frontend:** https://path-finder-ai-five.vercel.app  
**API Docs:** https://pathfinder-backend-yagz.onrender.com/docs

---

## Architecture

```
User Input (natural language)
        │
        ▼
┌───────────────────┐     Optional UX layer — NOT load-bearing
│  Multi-LLM Layer  │  ←  Groq → Gemini → NVIDIA (auto-fallback)
│  (chat-intake +   │     Two-pass extraction: domain detection (Pass 1, ~20 tokens)
│   explain-text)   │     then skill extraction on focused domain list (Pass 2, ~90% smaller)
└────────┬──────────┘
         │ structured profile {domain, known_skills, goal_skill}
         ▼
┌────────────────────────────────────────────────────────┐
│               PathEngine (deterministic core)           │
│                                                         │
│  1. Skill Graph (DAG)   →  prerequisite dependencies    │
│  2. generate_path()     →  DFS topological sort O(V+E)  │
│  3. generate_optimal_path() → Kahn's + min-heap O((V+E)logV) │
│  4. TF-IDF matching     →  course-to-skill links        │
│  5. recommend_courses() →  rating-ranked real courses   │
└────────────────────────────────────────────────────────┘
         │ ordered milestones + real Coursera courses
         ▼
    React Dashboard (progress tracking, explain modal)
```

**Key design principle:** the recommendation engine is 100% deterministic and runs fully offline. LLM is an optional UX layer for natural language input and skill explanations — not the recommendation mechanism. If all three LLM providers fail, the path generation and course recommendations continue to work.

---

## Real Performance Benchmarks

Measured on the live dataset (2118 courses, 131 skills across 6 domains):

| Operation | Time |
|-----------|------|
| PathEngine cold load (2118 courses, 131 skills) | ~175ms |
| `generate_path()` — DFS topological sort | **0.01ms** |
| `generate_optimal_path()` — Kahn's + min-heap | **0.03ms** |
| `build_learning_plan()` — full path + course lookup | **~29ms** |
| LLM call (Groq, chat-intake) | ~800ms–2s |

**The entire recommendation pipeline runs in under 30ms with zero API calls.**  
LLM adds latency only for the natural-language intake step (chat tab) and the "Why this skill?" explanations — both are optional.

---

## Algorithms

### Standard Path: DFS Topological Sort
- Traverses the skill prerequisite DAG via post-order DFS
- Returns a valid topological ordering respecting all prerequisites
- Complexity: O(V + E)

### Optimal Path: Kahn's Algorithm + Min-Heap (SPT Scheduling)
Why not Dijkstra: the skill graph has AND-semantics — every prerequisite is mandatory, not a choice between alternatives. Dijkstra solves OR-semantics (pick cheapest alternative route) — wrong tool for this problem.

What we use instead: **Kahn's algorithm with a priority queue**, applying the Shortest-Processing-Time (SPT) scheduling rule from operations research. When multiple independent skills become simultaneously available (prerequisites satisfied, no dependency between them), this schedules the shorter one first — proven optimal for minimizing average completion time (Smith's rule / Critical Path Method lineage).

- Edge weights: real average course duration (months) from actual Coursera Duration fields
- Complexity: O((V + E) log V)
- Effect: front-loads quick wins, visibly different ordering from DFS on branching skill graphs

### Course Matching: TF-IDF + Cosine Similarity
- Character n-gram TF-IDF vectorization of course titles and skill names
- Cosine similarity matching links each skill to real courses
- 100% skill coverage across all 6 domains (every skill has ≥1 matched course)

### Multi-LLM Fallback
- **Pass 1** (fast): detect domain from free-text (~20 output tokens, near-instant)
- **Pass 2** (focused): extract skills using only the detected domain's skill list (~90% smaller prompt than sending all 131 skills)
- Provider chain: Groq (primary) → Gemini 3.7 Flash → NVIDIA (fallbacks on rate limit)

---

## Data

| Domain | Courses | Skills | Coverage |
|--------|---------|--------|----------|
| Data Science | 521 | 25 | 100% |
| Web Development | 383 | 25 | 100% |
| Cybersecurity | 75 | 21 | 100% |
| Business* | 818 | 20 | 100% |
| Health* | 256 | 20 | 100% |
| Personal Development* | 65 | 20 | 100% |
| **Total** | **2118** | **131** | **100%** |

*Extended domains (available via `GET /api/domains?include_extended=true`) — demonstrate the pipeline is domain-agnostic. Not shown in default UI to keep the product focused on CSE for this hackathon's context.

Source: Coursera/Udacity course catalogue (real titles, ratings, durations, skill tags).

### Free resources

`backend/data/free_resources_mapping.json` is an additive, skill-to-resource catalog kept separate from `course_skill_mapping.json`. `POST /api/resources/for-path` returns relevant free resources for a learner path, supports the `video`, `reading`, `interactive`, and `reference` format filters, and creates all "why this resource" explanations in one batched LLM request. If the LLM is unavailable, cards fall back to their curated source descriptions.

---

## Stack
- **Backend**: FastAPI, Python, Pandas, scikit-learn
- **Frontend**: React 18, Vite, custom CSS (dark glassmorphism)
- **Deployment**: Render (backend) + Vercel (frontend)
- **LLMs**: Groq (llama-3.3-70b), Gemini 3.7 Flash, NVIDIA (llama-3.1-70b)

---

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env — add at least one of: GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY
uvicorn main:app --reload
# → http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Environment Variables
```
GROQ_API_KEY=gsk_...          # Free at console.groq.com
GEMINI_API_KEY=...             # Free at aistudio.google.com/apikey
NVIDIA_API_KEY=nvapi-...       # Free at build.nvidia.com
OPENAI_API_BASE=https://integrate.api.nvidia.com/v1
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness check + service stats |
| GET | `/api/stats` | Request counters, uptime |
| GET | `/api/domains` | Core CSE domains (add `?include_extended=true` for all 6) |
| GET | `/api/skills/{domain}` | All skills + prerequisite edges for a domain |
| POST | `/api/chat-intake` | LLM: extract structured profile from free-text goal |
| POST | `/api/profile` | Create learner profile (validates against real skill graph) |
| POST | `/api/path` | Standard learning path (DFS topological sort) |
| POST | `/api/path/optimal` | Time-optimal path (Kahn's + SPT) with duration estimates |
| POST | `/api/explain` | LLM: grounded explanation for why a skill is recommended |
| POST | `/api/resources/for-path` | Free resources for a path; optional `resource_format` filter and batched explanations |
| POST | `/api/progress` | Mark skills complete, recompute remaining path |
