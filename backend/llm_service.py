"""
Multi-LLM service with automatic fallback.

Tries LLM providers in order: Groq → Gemini → NVIDIA
Falls back to next provider if quota/rate limits hit.

Used for:
  - /api/chat-intake : extracting structured profile fields from free text
  - /api/explain      : generating grounded "why this skill" explanations

If all providers fail, returns clear error string for graceful degradation.
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

# LLM API Keys (checked in priority order)
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("groq")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("gemini")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY") or os.getenv("OPENAI_API_KEY")  # NVIDIA uses OpenAI format

# Model configurations
GROQ_MODEL = "llama-3.3-70b-versatile"
GEMINI_MODEL = "gemini-1.5-flash"
NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"  # Fast reasoning model

_groq_client = None
_gemini_client = None
_nvidia_client = None


def _get_groq_client():
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        _groq_client = Groq(api_key=GROQ_API_KEY)
        return _groq_client
    except Exception:
        return None


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    if not GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_client = genai.GenerativeModel(GEMINI_MODEL)
        return _gemini_client
    except Exception:
        return None


def _get_nvidia_client():
    global _nvidia_client
    if _nvidia_client is not None:
        return _nvidia_client
    if not NVIDIA_API_KEY:
        return None
    try:
        from openai import OpenAI
        _nvidia_client = OpenAI(
            api_key=NVIDIA_API_KEY,
            base_url="https://integrate.api.nvidia.com/v1"
        )
        return _nvidia_client
    except Exception:
        return None


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
    """
    Generic LLM call with automatic fallback.
    Tries: Groq → Gemini → NVIDIA
    Returns model text or 'LLM_ERROR: ...' string.
    """
    
    # Try Groq first
    groq_client = _get_groq_client()
    if groq_client:
        try:
            completion = groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.3,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            error_msg = str(e).lower()
            # If rate limit or quota, fall back; otherwise return error
            if "rate" in error_msg or "quota" in error_msg or "limit" in error_msg:
                pass  # Fall through to next provider
            else:
                return f"LLM_ERROR: Groq failed: {str(e)}"
    
    # Try Gemini fallback
    gemini_client = _get_gemini_client()
    if gemini_client:
        try:
            response = gemini_client.generate_content(
                f"{system_prompt}\n\n{user_prompt}",
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": 0.3,
                }
            )
            return response.text.strip()
        except Exception as e:
            error_msg = str(e).lower()
            if "rate" in error_msg or "quota" in error_msg or "limit" in error_msg:
                pass  # Fall through to NVIDIA
            else:
                return f"LLM_ERROR: Gemini failed: {str(e)}"
    
    # Try NVIDIA fallback
    nvidia_client = _get_nvidia_client()
    if nvidia_client:
        try:
            completion = nvidia_client.chat.completions.create(
                model=NVIDIA_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.3,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            return f"LLM_ERROR: NVIDIA failed: {str(e)}"
    
    # All providers failed or unavailable
    return "LLM_ERROR: No LLM providers available. Check API keys in backend/.env"


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
