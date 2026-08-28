"""Pydantic request/response schemas for the PathFinder API."""
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any


# ---------- Profile ----------

class ProfileCreateRequest(BaseModel):
    name: str
    domain: str = Field(..., description="One of: Data Science, Web Development, Cybersecurity")
    known_skills: List[str] = Field(default_factory=list, description="List of skill_ids the learner already knows")
    goal_skill_id: str = Field(..., description="Target skill_id the learner wants to reach")
    time_per_week_hours: Optional[int] = None


class StructuredProfileRequest(BaseModel):
    """Structured intake — no LLM needed. All values validated against skill_graph."""
    name: str = "Learner"
    domain: str = Field(..., description="Must exist in skill_graph.json")
    known_skill_ids: List[str] = Field(default_factory=list, description="Skill IDs the learner already knows (optional)")
    goal_skill_id: str = Field(..., description="Target skill ID in the selected domain")
    time_per_week_hours: int = Field(..., ge=1, le=60, description="Hours available per week")


class ProfileResponse(BaseModel):
    user_id: str
    profile: Dict[str, Any]


# ---------- Chat intake ----------

class ChatIntakeRequest(BaseModel):
    message: str = Field(..., description="Learner's free-text description of their goal")


class ChatIntakeResponse(BaseModel):
    domain: Optional[str] = None
    known_skills: List[str] = Field(default_factory=list, description="Skill IDs the learner knows")
    known_skill_names: List[str] = Field(default_factory=list, description="Human-readable skill names")
    goal_skill_id: Optional[str] = None
    goal_skill_name: Optional[str] = None
    time_per_week_hours: Optional[int] = None
    raw_llm_reasoning: str = ""
    warning: Optional[str] = None


# ---------- Skills ----------

class SkillItem(BaseModel):
    id: str
    name: str
    prereqs: List[str]


# ---------- Path ----------

class PathRequest(BaseModel):
    domain: str
    target_skill_id: str
    known_skills: List[str] = Field(default_factory=list)
    courses_per_skill: int = 2


class CourseItem(BaseModel):
    course_id: str
    Title: str
    Site: str
    Level: Optional[str] = None
    Rating: Optional[float] = None
    URL: Optional[str] = None
    domain: Optional[str] = None


class MilestoneItem(BaseModel):
    milestone: int
    skill_id: str
    skill_name: str
    recommended_courses: List[CourseItem]


class PathResponse(BaseModel):
    domain: str
    target_skill_id: str
    plan: List[MilestoneItem]


# ---------- Explain ----------

class ExplainRequest(BaseModel):
    skill_name: str
    domain: str
    learner_goal: str = ""


class ExplainResponse(BaseModel):
    explanation: str


# ---------- Progress ----------

class ProgressRequest(BaseModel):
    user_id: str
    completed_skill_ids: List[str]


class ProgressResponse(BaseModel):
    user_id: str
    progress_percent: float
    remaining_plan: List[MilestoneItem]
    completed_count: int
    total_count: int


# ---------- ML Risk Score ----------

class RiskScoreRequest(BaseModel):
    gender: Literal["F", "M"] = Field(..., description="Gender: F or M")
    region: Literal[
        "East Anglian Region", "East Midlands Region", "Ireland", "London Region",
        "North Region", "North Western Region", "Scotland", "South East Region",
        "South Region", "South West Region", "Wales", "West Midlands Region",
        "Yorkshire Region",
    ] = Field(..., description="UK region (OULAD schema)")
    highest_education: Literal[
        "A Level or Equivalent", "HE Qualification", "Lower Than A Level",
        "No Formal quals", "Post Graduate Qualification",
    ] = Field(..., description="Highest education level (OULAD schema)")
    imd_band: Literal[
        "0-10%", "10-20", "20-30%", "30-40%", "40-50%", "50-60%",
        "60-70%", "70-80%", "80-90%", "90-100%", "nan",
    ] = Field(..., description="IMD deprivation band (OULAD schema)")
    age_band: Literal["0-35", "35-55", "55<="] = Field(..., description="Age band")
    disability: Literal["N", "Y"] = Field("N", description="Disability: N or Y")
    num_of_prev_attempts: int = Field(0, ge=0)
    studied_credits: float = Field(120.0, gt=0)
    avg_score: float = Field(60.0, ge=0, le=100)
    num_assessments: int = Field(0, ge=0)
    total_clicks: int = Field(0, ge=0)
    avg_clicks: float = Field(0.0, ge=0)


class RiskScoreResponse(BaseModel):
    risk_score: float = Field(..., description="Probability of non-completion (0-1)")
    risk_band: str = Field(..., description="low, medium, or high")
    model_accuracy: str
    model_f1: str
    dataset: str
    feature_importance: List[Dict[str, Any]]
    fallback_fields: List[str] = Field(default_factory=list, description="Categorical fields that used fallback encoding")
    data_source_warning: Optional[str] = Field(None, description="Warning if fallback was used")


# ---------- ML Course Embeddings ----------

class RecommendEmbeddingsRequest(BaseModel):
    goal_text: str = Field(..., min_length=3, description="Natural language goal description")
    top_k: int = Field(5, ge=1, le=20)


class RecommendedCourse(BaseModel):
    course_title: str
    course_organization: str
    course_difficulty: str
    similarity_score: float
    text_profile: str = ""


class RecommendEmbeddingsResponse(BaseModel):
    goal_text: str
    top_k: int
    recommendations: List[RecommendedCourse]


# ---------- SHAP Explanation ----------

class ShapExplainRequest(BaseModel):
    gender: Literal["F", "M"] = Field(..., description="Gender: F or M")
    region: Literal[
        "East Anglian Region", "East Midlands Region", "Ireland", "London Region",
        "North Region", "North Western Region", "Scotland", "South East Region",
        "South Region", "South West Region", "Wales", "West Midlands Region",
        "Yorkshire Region",
    ] = Field(..., description="UK region (OULAD schema)")
    highest_education: Literal[
        "A Level or Equivalent", "HE Qualification", "Lower Than A Level",
        "No Formal quals", "Post Graduate Qualification",
    ] = Field(..., description="Highest education level (OULAD schema)")
    imd_band: Literal[
        "0-10%", "10-20", "20-30%", "30-40%", "40-50%", "50-60%",
        "60-70%", "70-80%", "80-90%", "90-100%", "nan",
    ] = Field(..., description="IMD deprivation band (OULAD schema)")
    age_band: Literal["0-35", "35-55", "55<="] = Field(..., description="Age band")
    disability: Literal["N", "Y"] = Field("N", description="Disability: N or Y")
    num_of_prev_attempts: int = Field(0, ge=0)
    studied_credits: float = Field(120.0, gt=0)
    avg_score: float = Field(60.0, ge=0, le=100)
    num_assessments: int = Field(0, ge=0)
    total_clicks: int = Field(0, ge=0)
    avg_clicks: float = Field(0.0, ge=0)


class ShapContribution(BaseModel):
    feature: str
    shap_value: float
    feature_value: float
    direction: str  # "pass" or "fail"


class ShapExplainResponse(BaseModel):
    base_value: float
    prediction: float
    risk_band: str
    contributions: List[ShapContribution]
    fallback_fields: List[str] = Field(default_factory=list, description="Categorical fields that used fallback encoding")
    data_source_warning: Optional[str] = Field(None, description="Warning if fallback was used")
    summary: str
