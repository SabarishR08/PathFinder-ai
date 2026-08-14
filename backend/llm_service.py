"""
Thin wrapper around the Groq API (free tier, OpenAI-compatible client).

Used for:
  - /api/chat-intake : extracting structured profile fields from free text
  - /api/explain      : generating grounded "why this skill" explanations

If GROQ_API_KEY is missing or the API call fails, functions return a clear
error string instead of raising, so endpoints degrade gracefully rather
than crashing the whole request.
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

# Support both GROQ_API_KEY (standard) and groq (as set in root .env)
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("groq")
MODEL_NAME = "llama-3.3-70b-versatile"

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        _client = Groq(api_key=GROQ_API_KEY)
        return _client
    except Exception:
        return None


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
    """Generic LLM call. Returns model text or a clear 'LLM_ERROR: ...' string."""
    client = _get_client()
    if client is None:
        return "LLM_ERROR: GROQ_API_KEY not set or groq package unavailable. Check backend/.env"

    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.3,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        return f"LLM_ERROR: {str(e)}"


def extract_intake_json(message: str, domain_options, skill_names_by_domain: dict) -> dict:
    """
    Calls the LLM to extract structured fields from a learner's free-text goal.
    skill_names_by_domain: { domain: [skill_name, ...] } — passed in so the LLM
    only picks from real skill names that exist in our graph, not invented ones.
    """
    domains_str = ", ".join(domain_options)
    skills_context = json.dumps(skill_names_by_domain, indent=2)

    system_prompt = f"""You are a structured-data extraction assistant for a learning
path recommender. Given a learner's free-text message, extract fields as STRICT JSON
only — no markdown, no preamble, no explanation outside the JSON object.

Valid domains: {domains_str}

Valid skill names per domain (you MUST only choose from these lists, do not invent
new skill names):
{skills_context}

Output JSON schema:
{{
  "domain": "<one of the valid domains, or null if unclear>",
  "known_skills": ["<skill names from the matching domain's list that the learner already knows>"],
  "goal_skill_name": "<the single skill name from the matching domain's list that best represents their end goal>",
  "time_per_week_hours": <integer or null>
}}

Respond with ONLY the JSON object."""

    raw = call_llm(system_prompt, message, max_tokens=400)

    if raw.startswith("LLM_ERROR"):
        return {"error": raw}

    # strip potential markdown fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        parsed["_raw"] = raw
        return parsed
    except json.JSONDecodeError:
        return {"error": f"LLM_ERROR: could not parse JSON from model output", "_raw": raw}


def explain_recommendation(skill_name: str, domain: str, learner_goal: str, prereq_chain: str) -> str:
    """
    Generates a short, grounded explanation for why a skill/course is recommended.
    prereq_chain is real data from path_engine.get_prereq_chain_text() — the LLM
    is instructed to reason from this chain rather than invent justifications.
    """
    system_prompt = """You are a learning advisor. Explain in 2-3 concise sentences
why a specific skill is recommended next for a learner, given their goal and the
REAL prerequisite chain provided. Base your explanation only on the prerequisite
chain and stated goal — do not invent facts about the skill or courses. Keep it
encouraging but factual."""

    user_prompt = f"""Learner's goal: {learner_goal or "not specified"}
Domain: {domain}
Skill being recommended: {skill_name}
Real prerequisite chain leading to this skill: {prereq_chain}

Explain why this skill matters next."""

    return call_llm(system_prompt, user_prompt, max_tokens=200)
