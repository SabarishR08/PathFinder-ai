"""
PathFinder backend — FastAPI app.

All recommendation logic flows through path_engine.PathEngine against the real
data files in data/ (979 real Coursera/Udacity courses, hand-built skill graph,
TF-IDF matched course-skill mapping). No mock/fabricated data is introduced here.

Run:
    uvicorn main:app --reload
Then visit http://localhost:8000/docs for interactive API docs.
"""
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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

app = FastAPI(
    title="PathFinder API",
    description="AI-powered personalized learning path recommender backend.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permissive for dev; lock down in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = PathEngine()

# In-memory profile store for the prototype. Keyed by user_id.
# Swap for a real DB (e.g. Supabase/Postgres) post-hackathon if needed.
PROFILES: dict = {}


@app.get("/health")
def health():
    """Basic liveness check."""
    return {"status": "ok"}


@app.get("/api/domains")
def get_domains():
    """List available learning domains."""
    return {"domains": engine.get_domains()}


@app.get("/api/skills/{domain}", response_model=list[SkillItem])
def get_skills(domain: str):
    """Return all skills (with prerequisite edges) for a given domain."""
    skills = engine.get_skills(domain)
    if not skills:
        raise HTTPException(status_code=404, detail=f"Unknown domain '{domain}'")
    return skills


@app.post("/api/profile", response_model=ProfileResponse)
def create_profile(req: ProfileCreateRequest):
    """
    Create a learner profile. Validates domain and goal_skill_id against the
    real skill graph before storing.
    """
    if req.domain not in engine.get_domains():
        raise HTTPException(status_code=400, detail=f"Unknown domain '{req.domain}'")

    valid_skill_ids = {s["id"] for s in engine.get_skills(req.domain)}
    if req.goal_skill_id not in valid_skill_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown goal_skill_id '{req.goal_skill_id}' for domain '{req.domain}'"
        )

    user_id = str(uuid.uuid4())[:8]
    profile = {
        "name": req.name,
        "domain": req.domain,
        "known_skills": req.known_skills,
        "goal_skill_id": req.goal_skill_id,
        "time_per_week_hours": req.time_per_week_hours,
        "completed_skill_ids": [],
    }
    PROFILES[user_id] = profile
    return {"user_id": user_id, "profile": profile}


@app.post("/api/chat-intake", response_model=ChatIntakeResponse)
def chat_intake(req: ChatIntakeRequest):
    """
    Extract a structured profile from a learner's free-text goal description,
    using the LLM constrained to only pick real domains/skill names from our
    skill graph (no hallucinated skills).
    """
    domain_options = engine.get_domains()
    skill_names_by_domain = {
        d: [s["name"] for s in engine.get_skills(d)] for d in domain_options
    }

    result = extract_intake_json(req.message, domain_options, skill_names_by_domain)

    if "error" in result:
        return ChatIntakeResponse(
            warning=result["error"],
            raw_llm_reasoning=result.get("_raw", ""),
        )

    domain = result.get("domain")
    goal_skill_name = result.get("goal_skill_name")
    goal_skill_id = None
    warning = None

    if domain and domain in engine.get_domains():
        if goal_skill_name:
            goal_skill_id = engine.find_skill_id_by_name(domain, goal_skill_name)
        if goal_skill_id is None:
            warning = "Could not confidently match a goal skill. Please confirm manually."
    else:
        warning = "Could not confidently determine a domain. Please confirm manually."
        domain = None

    known_skill_names = result.get("known_skills", []) or []
    known_skill_ids = []
    if domain:
        for name in known_skill_names:
            sid = engine.find_skill_id_by_name(domain, name)
            if sid:
                known_skill_ids.append(sid)

    return ChatIntakeResponse(
        domain=domain,
        known_skills=known_skill_ids,
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
    """
    try:
        plan = engine.build_learning_plan(
            domain=req.domain,
            target_skill_id=req.target_skill_id,
            known_skills=req.known_skills,
            courses_per_skill=req.courses_per_skill,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"domain": req.domain, "target_skill_id": req.target_skill_id, "plan": plan}


@app.post("/api/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest):
    """
    Generate a short, grounded explanation for why a skill is recommended,
    using the REAL prerequisite chain from the skill graph as context so the
    LLM cannot fabricate reasoning disconnected from actual data.
    """
    skill_id = engine.find_skill_id_by_name(req.domain, req.skill_name)
    prereq_chain = ""
    if skill_id:
        prereq_chain = engine.get_prereq_chain_text(req.domain, skill_id)

    explanation = explain_recommendation(
        skill_name=req.skill_name,
        domain=req.domain,
        learner_goal=req.learner_goal,
        prereq_chain=prereq_chain,
    )
    return {"explanation": explanation}


@app.post("/api/progress", response_model=ProgressResponse)
def update_progress(req: ProgressRequest):
    """
    Mark skills as completed for a learner and recompute the remaining path.
    """
    profile = PROFILES.get(req.user_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Unknown user_id '{req.user_id}'")

    profile["completed_skill_ids"] = sorted(set(req.completed_skill_ids))

    known_and_completed = list(set(profile["known_skills"]) | set(profile["completed_skill_ids"]))

    remaining_plan = engine.build_learning_plan(
        domain=profile["domain"],
        target_skill_id=profile["goal_skill_id"],
        known_skills=known_and_completed,
    )

    full_plan = engine.build_learning_plan(
        domain=profile["domain"],
        target_skill_id=profile["goal_skill_id"],
        known_skills=profile["known_skills"],
    )
    total_count = len(full_plan)
    completed_count = total_count - len(remaining_plan)
    progress_percent = round((completed_count / total_count) * 100, 1) if total_count else 100.0

    return {
        "user_id": req.user_id,
        "progress_percent": progress_percent,
        "remaining_plan": remaining_plan,
        "completed_count": completed_count,
        "total_count": total_count,
    }
