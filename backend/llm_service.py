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
import logging
import re
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("pathfinder.llm")

# ── API Keys ─────────────────────────────────────────────────────────────────
GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY") or os.getenv("groq")
GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY") or os.getenv("gemini")
NVIDIA_API_KEY: Optional[str] = os.getenv("NVIDIA_API_KEY") or os.getenv("OPENAI_API_KEY")

# ── Model names ───────────────────────────────────────────────────────────────
GROQ_MODEL = "openai/gpt-oss-120b"
GEMINI_MODEL = "gemini-3.7-flash"      # Latest free-tier Gemini model
NVIDIA_MODEL = "meta/llama-3.1-70b-instruct"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# ── Lazy-init clients ─────────────────────────────────────────────────────────
_groq_client = None
_gemini_client = None
_nvidia_client = None


def _get_groq_client():
    """Lazily initialise the Groq client."""
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set — Groq unavailable")
        return None
    try:
        from groq import Groq
        _groq_client = Groq(api_key=GROQ_API_KEY)
        logger.info("Groq client initialised")
        return _groq_client
    except Exception as e:
        logger.error("Failed to init Groq client: %s", e)
        return None


def _get_gemini_client():
    """Lazily initialise the Gemini GenerativeModel client."""
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — Gemini unavailable")
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_client = genai.GenerativeModel(GEMINI_MODEL)
        logger.info("Gemini client initialised (model=%s)", GEMINI_MODEL)
        return _gemini_client
    except Exception as e:
        logger.error("Failed to init Gemini client: %s", e)
        return None


def _get_nvidia_client():
    """Lazily initialise the NVIDIA/OpenAI-compatible client."""
    global _nvidia_client
    if _nvidia_client is not None:
        return _nvidia_client
    if not NVIDIA_API_KEY:
        logger.warning("NVIDIA_API_KEY not set — NVIDIA unavailable")
        return None
    try:
        from openai import OpenAI
        _nvidia_client = OpenAI(
            api_key=NVIDIA_API_KEY,
            base_url=NVIDIA_BASE_URL,
        )
        logger.info("NVIDIA client initialised (model=%s)", NVIDIA_MODEL)
        return _nvidia_client
    except Exception as e:
        logger.error("Failed to init NVIDIA client: %s", e)
        return None


def _is_rate_limit_error(error_msg: str) -> bool:
    """Check if an error message indicates a rate/quota limit (should fall back)."""
    keywords = ["rate", "quota", "limit", "429", "resource_exhausted", "too many"]
    return any(kw in error_msg.lower() for kw in keywords)


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
    """
    Generic LLM call with automatic provider fallback.

    Tries: Groq → Gemini → NVIDIA
    - Falls back on rate-limit / quota errors
    - Returns immediately on auth / model errors
    - Returns 'LLM_ERROR: ...' string if all providers fail

    Args:
        system_prompt: Instruction context for the model.
        user_prompt:   User/task input.
        max_tokens:    Maximum output tokens.

    Returns:
        Model response text, or 'LLM_ERROR: <reason>' on failure.
    """
    last_error: Optional[str] = None

    # ── Groq ──────────────────────────────────────────────────────────────────
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
            text = completion.choices[0].message.content.strip()
            logger.info("LLM response via Groq (%d tokens)", len(text.split()))
            return text
        except Exception as e:
            last_error = f"Groq: {e}"
            logger.warning("Groq failed: %s", e)
            if not _is_rate_limit_error(str(e)):
                return f"LLM_ERROR: {last_error}"

    # ── Gemini ────────────────────────────────────────────────────────────────
    gemini_client = _get_gemini_client()
    if gemini_client:
        try:
            response = gemini_client.generate_content(
                f"{system_prompt}\n\n{user_prompt}",
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": 0.3,
                },
            )
            text = response.text.strip()
            logger.info("LLM response via Gemini (%d tokens)", len(text.split()))
            return text
        except Exception as e:
            last_error = f"Gemini: {e}"
            logger.warning("Gemini failed: %s", e)
            if not _is_rate_limit_error(str(e)):
                return f"LLM_ERROR: {last_error}"

    # ── NVIDIA ────────────────────────────────────────────────────────────────
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
            text = completion.choices[0].message.content.strip()
            logger.info("LLM response via NVIDIA (%d tokens)", len(text.split()))
            return text
        except Exception as e:
            last_error = f"NVIDIA: {e}"
            logger.warning("NVIDIA failed: %s", e)
            return f"LLM_ERROR: {last_error}"

    # ── All providers unavailable ─────────────────────────────────────────────
    configured = [
        name for name, key in [("Groq", GROQ_API_KEY), ("Gemini", GEMINI_API_KEY), ("NVIDIA", NVIDIA_API_KEY)]
        if key
    ]
    if not configured:
        return "LLM_ERROR: No API keys configured. Set GROQ_API_KEY, GEMINI_API_KEY, or NVIDIA_API_KEY."
    return f"LLM_ERROR: All providers failed. Last error: {last_error}"


def _clean_json_response(raw: str) -> str:
    """
    Strip markdown code fences and stray text surrounding a JSON object.
    Handles: ```json ... ```, ``` ... ```, and leading/trailing noise.
    """
    text = raw.strip()

    # Remove markdown fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    # Extract the first complete JSON object if there's surrounding text
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        text = match.group(0)

    return text.strip()


def _detect_domain(message: str, domain_options: list[str]) -> Optional[str]:
    """
    Pass 1 (fast): detect just the domain from the user message.

    Uses keyword matching first (instant, 100% reliable for clear signals),
    then falls back to LLM classification for ambiguous cases.

    Returns the matched domain string or None.
    """
    msg_lower = message.lower()

    # ── Keyword-based fast routing (highest priority) ─────────────────────────
    # Ordered from most-specific to least-specific to avoid false positives.
    KEYWORD_RULES: list[tuple[list[str], str]] = [
        # AI Engineering
        (["ai engineer", "llm app", "build with llm", "ai agent", "tool use",
          "function calling", "fine-tun", "model deploy", "model serving",
          "inference infrastructure", "agentic", "orchestrat"],
         "AI Engineering"),
        # Prompt Engineering & LLMOps
        (["prompt engineer", "chain-of-thought", "few-shot", "in-context learn",
          "llmops", "guardrail", "jailbreak", "prompt test", "prompt version",
          "adversarial prompt", "structured output", "prompt chain"],
         "Prompt Engineering & LLMOps"),
        # Generative AI & RAG Systems
        (["rag", "retrieval augmented", "vector database", "vector db",
          "vector store", "embedding", "semantic search", "generative ai",
          "genai", "knowledge base", "chunking", "rerank", "pinecone",
          "weaviate", "chroma", "faiss", "langchain", "llamaindex"],
         "Generative AI & RAG Systems"),
        # Cybersecurity
        (["cybersecurity", "cyber security", "penetration test", "pentest",
          "ctf", "owasp", "malware", "forensic", "infosec", "ethical hack",
          "network security", "cryptograph"],
         "Cybersecurity"),
        # Cloud Computing
        (["cloud computing", "aws", "azure", "google cloud", "gcp",
          "kubernetes", "docker", "devops", "terraform", "serverless",
          "cloud architect", "cloud engineer"],
         "Cloud Computing"),
        # Web Development
        (["web dev", "frontend", "backend", "full stack", "fullstack",
          "react", "javascript", "typescript", "html", "css", "node.js",
          "django", "flask api", "web application", "web app", "website"],
         "Web Development"),
        # Machine Learning (before Data Science to avoid DS absorbing ML)
        (["machine learning engineer", "ml engineer", "deep learning",
          "neural network", "tensorflow", "pytorch", "keras", "nlp",
          "computer vision", "reinforcement learn"],
         "Machine Learning"),
        # Data Science
        (["data science", "data scientist", "data analyst", "data engineer",
          "pandas", "sql analyst", "tableau", "r language", "statistics",
          "data visualization", "exploratory data"],
         "Data Science"),
    ]

    for keywords, domain in KEYWORD_RULES:
        if domain in domain_options and any(kw in msg_lower for kw in keywords):
            logger.info("Pass 1 keyword match: '%s' → '%s'", keywords[0], domain)
            return domain

    # ── LLM fallback for ambiguous cases ─────────────────────────────────────
    # Put AI-specific domains first so model sees them before generic ones
    reordered = []
    priority = ["AI Engineering", "Prompt Engineering & LLMOps", "Generative AI & RAG Systems"]
    for d in priority:
        if d in domain_options:
            reordered.append(d)
    for d in domain_options:
        if d not in reordered:
            reordered.append(d)
    domains_str = "\n".join(f"- {d}" for d in reordered)

    system_prompt = (
        "You are a domain classifier. Given a learner's goal, return ONLY the "
        "single best matching domain name from the list below — no explanation, "
        "no punctuation, no markdown. If unclear, return null.\n\n"
        f"Valid domains:\n{domains_str}"
    )
    user_prompt = f"Learner's goal: {message}\n\nReturn ONLY the domain name."
    raw = call_llm(system_prompt, user_prompt, max_tokens=20)
    if raw.startswith("LLM_ERROR"):
        return None
    raw = raw.strip().strip('"').strip("'")
    # Exact match first
    for d in domain_options:
        if d.lower() == raw.lower():
            return d
    # Substring match fallback
    for d in domain_options:
        if d.lower() in raw.lower() or raw.lower() in d.lower():
            return d
    return None


def extract_intake_json(
    message: str,
    domain_options: list[str],
    skill_names_by_domain: dict[str, list[str]],
) -> dict:
    """
    Two-pass LLM extraction for speed and accuracy.

    Pass 1 — domain detection (tiny prompt, ~20 output tokens, fast).
    Pass 2 — skill extraction using ONLY the detected domain's skill list
              (avoids sending ~200 skills from all 10 domains, cuts tokens by ~90%).

    This fixes two problems:
      - Speed: Pass 1 is near-instant; Pass 2 prompt is 90% smaller.
      - Accuracy: LLM sees only the relevant domain's skills so it doesn't
        confuse cross-domain skills (e.g. SQL exists in both Data Science and
        Machine Learning — with a focused list it picks the right one).

    Args:
        message:               Learner's raw goal description.
        domain_options:        Valid domain names from skill_graph.
        skill_names_by_domain: Mapping of domain → list of valid skill names.

    Returns:
        Dict with keys: domain, known_skills, goal_skill_name, time_per_week_hours.
        On error: {"error": "LLM_ERROR: ..."} with optional "_raw" key.
    """
    # ── Pass 1: fast domain detection ────────────────────────────────────────
    domain = _detect_domain(message, domain_options)
    logger.info("Pass 1 domain detection: '%s'", domain)

    # ── Pass 2: focused skill extraction ─────────────────────────────────────
    # Only send skills for the detected domain (or all domains if detection failed)
    if domain and domain in skill_names_by_domain:
        focused_skills = {domain: skill_names_by_domain[domain]}
    else:
        # Fallback: send all but warn
        logger.warning("Domain detection failed, using full skill list")
        focused_skills = skill_names_by_domain

    skills_list = "\n".join(
        f"- {s}" for s in list(focused_skills.values())[0]
    ) if len(focused_skills) == 1 else json.dumps(focused_skills, indent=2)

    domain_hint = f'Use domain: "{domain}".' if domain else f"Valid domains: {', '.join(domain_options)}."

    system_prompt = f"""You are a structured-data extraction assistant. Extract fields as STRICT JSON only.

{domain_hint}

Valid skill names for this domain (ONLY use names from this list, do not invent new ones):
{skills_list}

Output JSON schema — respond with ONLY this object, no markdown, no explanation:
{{
  "domain": "{domain or '<one of the valid domains>'}",
  "known_skills": ["<exact skill names from the list above that the learner already knows>"],
  "goal_skill_name": "<the single skill name from the list that best represents their end goal>",
  "time_per_week_hours": <integer or null>
}}"""

    raw = call_llm(system_prompt, message, max_tokens=400)

    if raw.startswith("LLM_ERROR"):
        return {"error": raw}

    cleaned = _clean_json_response(raw)

    try:
        parsed = json.loads(cleaned)
        # If domain was detected in Pass 1 but LLM overrode it, trust Pass 1
        if domain and not parsed.get("domain"):
            parsed["domain"] = domain
        parsed["_raw"] = raw
        logger.info("Pass 2 extracted: domain=%s goal=%s known=%s",
                    parsed.get("domain"), parsed.get("goal_skill_name"),
                    parsed.get("known_skills"))
        return parsed
    except json.JSONDecodeError as e:
        logger.warning("JSON parse failed: %s | raw: %s", e, raw[:200])
        return {
            "error": "LLM_ERROR: could not parse JSON from model output",
            "_raw": raw,
        }


def explain_recommendation(
    skill_name: str,
    domain: str,
    learner_goal: str,
    prereq_chain: str,
) -> str:
    """
    Generate a short, grounded explanation for why a skill/course is recommended.

    Uses the real prerequisite chain from path_engine as context so the LLM
    reasons from actual graph data rather than inventing justifications.

    Args:
        skill_name:   The skill being explained.
        domain:       Learning domain (e.g. "Machine Learning").
        learner_goal: The learner's stated end goal.
        prereq_chain: Human-readable prereq chain from path_engine.

    Returns:
        2-3 sentence explanation string, or 'LLM_ERROR: ...' on failure.
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


def explain_resources_batch(learner_gaps: list[dict]) -> dict[str, str]:
    """Create all resource explanations in one LLM request for a path."""
    if not learner_gaps:
        return {}

    payload = [
        {
            "resource_id": item["resource"]["resource_id"],
            "learner_gap": item["learner_gap"],
            "title": item["resource"]["title"],
            "type": item["resource"]["resource_type"],
            "provider": item["resource"]["provider"],
            "format": item["resource"]["format"],
            "difficulty": item["resource"]["difficulty"],
            "description": item["resource"]["description_raw"],
        }
        for item in learner_gaps
    ]
    system_prompt = """You are a learning advisor. For each supplied resource, write one concrete sentence of at most 25 words explaining what the learner can do after using it. Do not use the words 'great' or 'amazing'. Return ONLY a JSON array, in the same order, with objects shaped exactly as {\"resource_id\": \"...\", \"explanation\": \"...\"}."""
    raw = call_llm(system_prompt, json.dumps(payload), max_tokens=min(60 * len(payload), 600))
    if raw.startswith("LLM_ERROR"):
        return {}
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned).strip()
    try:
        rows = json.loads(cleaned)
        if not isinstance(rows, list):
            return {}
        return {
            row["resource_id"]: row["explanation"].strip()
            for row in rows
            if isinstance(row, dict) and isinstance(row.get("resource_id"), str)
            and isinstance(row.get("explanation"), str)
        }
    except (json.JSONDecodeError, TypeError, KeyError):
        logger.warning("Could not parse batched resource explanations")
        return {}
