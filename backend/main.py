"""
PathFinder backend — FastAPI app.

All recommendation logic flows through path_engine.PathEngine against the real
data files in data/ (979 real Coursera/Udacity courses, hand-built skill graph,
TF-IDF matched course-skill mapping). No mock/fabricated data is introduced here.

Run:
    uvicorn main:app --reload
Then visit http://localhost:8000/docs for interactive API docs.
"""
import os
import uuid
import time
import logging
from datetime import datetime
from functools import lru_cache
from collections import defaultdict
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from path_engine import PathEngine
from llm_service import extract_intake_json, explain_recommendation
from models import (
    ProfileCreateRequest, ProfileResponse,
    ChatIntakeRequest, ChatIntakeResponse,
    SkillItem,
    PathRequest, PathResponse,
    ExplainRequest, ExplainResponse,
    ProgressRequest, ProgressResponse,
)

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pathfinder")

# ── App init ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PathFinder API",
    description="AI-powered personalized learning path recommender backend.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
allowed_origins = (
    [o.strip() for o in _allowed_origins_env.split(",")]
    if _allowed_origins_env
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
# Simple in-memory rate limiter: max 30 requests per minute per IP
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MIN", "30"))
_rate_store: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    now = time.time()
    window = 60.0
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < window]
    if len(_rate_store[ip]) >= RATE_LIMIT:
        return False
    _rate_store[ip].append(now)
    return True

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Rate-limit all /api/* routes."""
    if request.url.path.startswith("/api/"):
        ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(ip):
            logger.warning("Rate limit hit for IP %s on %s", ip, request.url.path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a moment and try again."},
            )
    return await call_next(request)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing."""
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    logger.info("%s %s → %d (%dms)", request.method, request.url.path, response.status_code, duration_ms)
    return response

# ── Engine + stores ───────────────────────────────────────────────────────────
engine = PathEngine()
PROFILES: dict[str, dict] = {}

# ── Request counter for stats ────────────────────────────────────────────────
_stats: dict[str, int] = defaultdict(int)
_start_time = datetime.utcnow()

# ── Input validation helpers ──────────────────────────────────────────────────
MAX_MESSAGE_LEN = 1000
MAX_NAME_LEN = 100

def _sanitize_str(s: str, max_len: int = MAX_MESSAGE_LEN) -> str:
    """Strip whitespace and enforce max length."""
    return s.strip()[:max_len] if s else ""

def _validate_domain(domain: str):
    """Raise 400 if domain is not in skill graph (checks core + extended)."""
    all_domains = engine.get_domains(include_extended=True)
    if domain not in all_domains:
        valid = ", ".join(all_domains)
        raise HTTPException(
            status_code=400,
            detail=f"Unknown domain '{domain}'. Valid domains: {valid}",
        )

def _validate_skill_id(domain: str, skill_id: str):
    """Raise 400 if skill_id is not in domain."""
    valid_ids = {s["id"] for s in engine.get_skills(domain)}
    if skill_id not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown skill_id '{skill_id}' for domain '{domain}'.",
        )


# ── Caching ───────────────────────────────────────────────────────────────────
@lru_cache(maxsize=256)
def _cached_path(domain: str, target_skill_id: str, known_skills_tuple: tuple, courses_per_skill: int):
    """Cache learning plan generation — same inputs always produce same output."""
    return engine.build_learning_plan(
        domain=domain,
        target_skill_id=target_skill_id,
        known_skills=list(known_skills_tuple),
        courses_per_skill=courses_per_skill,
    )


# ════════════════════════════════════════════════════════════════════════════
# Routes
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    """Liveness + readiness check with service metadata."""
    domains = engine.get_domains()
    total_skills = sum(len(engine.get_skills(d)) for d in domains)
    return {
        "status": "ok",
        "version": "1.0.0",
        "domains": len(domains),
        "total_skills": total_skills,
        "uptime_seconds": int((datetime.utcnow() - _start_time).total_seconds()),
        "profiles_in_memory": len(PROFILES),
    }


@app.get("/api/stats")
def get_stats():
    """Usage statistics for monitoring."""
    return {
        "uptime_seconds": int((datetime.utcnow() - _start_time).total_seconds()),
        "total_profiles": len(PROFILES),
        "request_counts": dict(_stats),
        "domains_available": engine.get_domains(include_extended=True),
    }


@app.get("/api/domains")
def get_domains(include_extended: bool = False):
    """
    List available learning domains.

    Defaults to the 3 core CSE-aligned domains (Data Science, Web Development,
    Cybersecurity) — this is the primary product surface, matching the
    Coursera/Udacity CSE-heavy source data.

    Pass ?include_extended=true to also list Business, Health, and Personal
    Development. These exist with the same real-data rigor (100% skill
    coverage, TF-IDF matched courses) and are fully queryable via the API —
    they demonstrate the pipeline generalizes beyond CSE — but are not part
    of the default onboarding flow.
    """
    _stats["get_domains"] += 1
    return {"domains": engine.get_domains(include_extended=include_extended)}


@app.get("/api/skills/{domain}", response_model=list[SkillItem])
def get_skills(domain: str):
    """Return all skills (with prerequisite edges) for a given domain."""
    _stats["get_skills"] += 1
    skills = engine.get_skills(domain)
    if not skills:
        raise HTTPException(status_code=404, detail=f"Unknown domain '{domain}'. "
                            f"Available: {', '.join(engine.get_domains(include_extended=True))}")
    return skills


@app.post("/api/profile", response_model=ProfileResponse)
def create_profile(req: ProfileCreateRequest):
    """
    Create a learner profile. Validates domain and goal_skill_id against the
    real skill graph before storing.
    """
    _stats["create_profile"] += 1

    # Sanitize
    name = _sanitize_str(req.name or "Learner", MAX_NAME_LEN) or "Learner"

    # Validate domain and skill
    _validate_domain(req.domain)
    _validate_skill_id(req.domain, req.goal_skill_id)

    # Validate known_skills exist in domain
    valid_ids = {s["id"] for s in engine.get_skills(req.domain)}
    invalid_known = [sid for sid in req.known_skills if sid not in valid_ids]
    if invalid_known:
        logger.warning("Profile creation: unknown known_skills %s — ignoring", invalid_known)

    known_skills = [sid for sid in req.known_skills if sid in valid_ids]

    user_id = str(uuid.uuid4())[:8]
    profile = {
        "name": name,
        "domain": req.domain,
        "known_skills": known_skills,
        "goal_skill_id": req.goal_skill_id,
        "time_per_week_hours": req.time_per_week_hours,
        "completed_skill_ids": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    PROFILES[user_id] = profile
    logger.info("Profile created: user_id=%s domain=%s goal=%s", user_id, req.domain, req.goal_skill_id)
    return {"user_id": user_id, "profile": profile}


@app.post("/api/chat-intake", response_model=ChatIntakeResponse)
def chat_intake(req: ChatIntakeRequest):
    """
    Extract a structured profile from a learner's free-text goal description,
    using the LLM constrained to only pick real domains/skill names from our
    skill graph (no hallucinated skills).
    """
    _stats["chat_intake"] += 1

    # Validate + sanitize input
    message = _sanitize_str(req.message)
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(message) < 5:
        raise HTTPException(status_code=400, detail="Message too short. Please describe your goal.")

    domain_options = engine.get_domains(include_extended=True)
    skill_names_by_domain = {
        d: [s["name"] for s in engine.get_skills(d)] for d in domain_options
    }

    try:
        result = extract_intake_json(message, domain_options, skill_names_by_domain)
    except Exception as e:
        logger.error("chat_intake LLM error: %s", str(e))
        raise HTTPException(status_code=503, detail="LLM service temporarily unavailable. Please try again.")

    if "error" in result:
        logger.warning("chat_intake: LLM returned error: %s", result["error"])
        return ChatIntakeResponse(
            warning=result["error"],
            raw_llm_reasoning=result.get("_raw", ""),
        )

    domain = result.get("domain")
    goal_skill_name = result.get("goal_skill_name")
    goal_skill_id = None
    warning = None

    if domain and domain in engine.get_domains(include_extended=True):
        if goal_skill_name:
            goal_skill_id = engine.find_skill_id_by_name(domain, goal_skill_name)
        if goal_skill_id is None:
            warning = "Could not confidently match a goal skill. Please confirm manually."
    else:
        warning = "Could not confidently determine a domain. Please confirm manually."
        domain = None

    known_skill_names = result.get("known_skills", []) or []
    known_skill_ids = []
    known_skill_names_resolved = []
    if domain:
        for name in known_skill_names:
            sid = engine.find_skill_id_by_name(domain, name)
            if sid:
                known_skill_ids.append(sid)
                # Get the canonical name from the graph
                skill_obj = next((s for s in engine.get_skills(domain) if s["id"] == sid), None)
                known_skill_names_resolved.append(skill_obj["name"] if skill_obj else name)

    logger.info("chat_intake: domain=%s goal=%s known=%s", domain, goal_skill_name, known_skill_ids)
    return ChatIntakeResponse(
        domain=domain,
        known_skills=known_skill_ids,
        known_skill_names=known_skill_names_resolved,
        goal_skill_id=goal_skill_id,
        goal_skill_name=goal_skill_name,
        time_per_week_hours=result.get("time_per_week_hours"),
        raw_llm_reasoning=result.get("_raw", ""),
        warning=warning,
    )


@app.post("/api/path", response_model=PathResponse)
def get_path(req: PathRequest):
    """
    Generate a milestone-based learning path with recommended real courses
    for each milestone, from the learner's current skills to their goal.
    Results are cached for identical inputs.
    """
    _stats["get_path"] += 1

    _validate_domain(req.domain)
    _validate_skill_id(req.domain, req.target_skill_id)

    courses_per_skill = max(1, min(req.courses_per_skill, 5))  # clamp 1–5

    try:
        plan = _cached_path(
            domain=req.domain,
            target_skill_id=req.target_skill_id,
            known_skills_tuple=tuple(sorted(req.known_skills)),
            courses_per_skill=courses_per_skill,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("get_path error: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to generate learning path. Please try again.")

    logger.info("get_path: domain=%s target=%s milestones=%d", req.domain, req.target_skill_id, len(plan))
    return {"domain": req.domain, "target_skill_id": req.target_skill_id, "plan": plan}


@lru_cache(maxsize=256)
def _cached_optimal_path(domain: str, target_skill_id: str, known_skills_tuple: tuple, courses_per_skill: int):
    """Cache optimal (SPT-scheduled) plan generation."""
    return engine.build_optimal_learning_plan(
        domain=domain,
        target_skill_id=target_skill_id,
        known_skills=list(known_skills_tuple),
        courses_per_skill=courses_per_skill,
    )


@app.post("/api/path/optimal")
def get_optimal_path(req: PathRequest):
    """
    Time-optimal learning path using weighted topological scheduling
    (Kahn's algorithm + min-heap, Shortest-Processing-Time rule).

    Same required skill set as /api/path (total time is order-independent
    for an AND-semantics prerequisite DAG — see path_engine.generate_optimal_path
    docstring for why Dijkstra does not apply here). What differs: whenever
    multiple skills become available at once with no dependency between them,
    this endpoint schedules the cheaper one first, and returns real per-skill
    and cumulative time estimates derived from actual matched course durations.

    Note on units: estimated months are averaged from real Coursera/Udacity
    course Duration fields, which describe casual self-paced study of ONE
    course at a time. Real learners typically study faster or in parallel,
    so treat cumulative totals as an upper bound, not a literal forecast.
    """
    _stats["get_optimal_path"] += 1

    _validate_domain(req.domain)
    _validate_skill_id(req.domain, req.target_skill_id)

    courses_per_skill = max(1, min(req.courses_per_skill, 5))

    try:
        plan = _cached_optimal_path(
            domain=req.domain,
            target_skill_id=req.target_skill_id,
            known_skills_tuple=tuple(sorted(req.known_skills)),
            courses_per_skill=courses_per_skill,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("get_optimal_path error: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to generate optimal path. Please try again.")

    total_months = plan[-1]["cumulative_estimated_months"] if plan else 0.0
    logger.info("get_optimal_path: domain=%s target=%s milestones=%d total_months=%.1f",
                req.domain, req.target_skill_id, len(plan), total_months)
    return {
        "domain": req.domain,
        "target_skill_id": req.target_skill_id,
        "algorithm": "Kahn's algorithm with min-heap (SPT scheduling)",
        "total_estimated_months": total_months,
        "duration_estimate_caveat": (
            "Estimated from real course Duration fields assuming one course "
            "at a time, self-paced. Studying faster or in parallel will reduce "
            "actual time-to-mastery below this figure."
        ),
        "plan": plan,
    }


@app.post("/api/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest):
    """
    Generate a short, grounded explanation for why a skill is recommended,
    using the REAL prerequisite chain from the skill graph as context.
    """
    _stats["explain"] += 1

    skill_name = _sanitize_str(req.skill_name, 200)
    if not skill_name:
        raise HTTPException(status_code=400, detail="skill_name cannot be empty.")

    skill_id = engine.find_skill_id_by_name(req.domain, skill_name)
    prereq_chain = ""
    if skill_id:
        prereq_chain = engine.get_prereq_chain_text(req.domain, skill_id)

    try:
        explanation = explain_recommendation(
            skill_name=skill_name,
            domain=req.domain,
            learner_goal=_sanitize_str(req.learner_goal, 500),
            prereq_chain=prereq_chain,
        )
    except Exception as e:
        logger.error("explain error: %s", str(e))
        raise HTTPException(status_code=503, detail="Explanation service temporarily unavailable.")

    return {"explanation": explanation}


@app.post("/api/progress", response_model=ProgressResponse)
def update_progress(req: ProgressRequest):
    """
    Mark skills as completed for a learner and recompute the remaining path.
    """
    _stats["update_progress"] += 1

    profile = PROFILES.get(req.user_id)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Session not found. Your session may have expired — please start a new learning path."
        )

    # Validate completed_skill_ids belong to the profile's domain
    valid_ids = {s["id"] for s in engine.get_skills(profile["domain"])}
    completed = [sid for sid in req.completed_skill_ids if sid in valid_ids]
    profile["completed_skill_ids"] = sorted(set(completed))

    known_and_completed = list(set(profile["known_skills"]) | set(profile["completed_skill_ids"]))

    try:
        remaining_plan = _cached_path(
            domain=profile["domain"],
            target_skill_id=profile["goal_skill_id"],
            known_skills_tuple=tuple(sorted(known_and_completed)),
            courses_per_skill=2,
        )
        full_plan = _cached_path(
            domain=profile["domain"],
            target_skill_id=profile["goal_skill_id"],
            known_skills_tuple=tuple(sorted(profile["known_skills"])),
            courses_per_skill=2,
        )
    except Exception as e:
        logger.error("update_progress path error: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to update progress. Please try again.")

    total_count = len(full_plan)
    completed_count = total_count - len(remaining_plan)
    progress_percent = round((completed_count / total_count) * 100, 1) if total_count else 100.0

    logger.info("progress: user=%s completed=%d/%d (%.1f%%)", req.user_id, completed_count, total_count, progress_percent)
    return {
        "user_id": req.user_id,
        "progress_percent": progress_percent,
        "remaining_plan": remaining_plan,
        "completed_count": completed_count,
        "total_count": total_count,
    }
