# 🧭 PathFinder AI

An AI-powered personalized learning path recommender built on real course data.

## Stack
- **Backend**: FastAPI + Python (path_engine + Groq LLM)
- **Frontend**: React + Vite (dark glassmorphism UI)
- **Data**: 979 real Coursera/Udacity courses, 71 skills, TF-IDF semantic matching

## Quick Start

### 1. Backend
```bash
cd backend
pip install -r requirements.txt

# Add your Groq API key (free at console.groq.com)
cp .env.example .env
# Edit .env → GROQ_API_KEY=your_key_here

uvicorn main:app --reload
# → http://localhost:8000/docs
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/api/domains` | List domains |
| GET | `/api/skills/{domain}` | Skills for a domain |
| POST | `/api/chat-intake` | LLM goal extraction |
| POST | `/api/profile` | Create learner profile |
| POST | `/api/path` | Generate learning path |
| POST | `/api/explain` | LLM skill explanation |
| POST | `/api/progress` | Update + recompute path |

## Domains
- 📊 **Data Science** — 25 skills, 521 courses
- 🌐 **Web Development** — 25 skills, 383 courses  
- 🔐 **Cybersecurity** — 21 skills, 75 courses
