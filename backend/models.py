"""Pydantic request/response schemas for the PathFinder API."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# ---------- Profile ----------

class ProfileCreateRequest(BaseModel):
    name: str
    domain: str = Field(..., description="One of: Data Science, Web Development, Cybersecurity")
    known_skills: List[str] = Field(default_factory=list, description="List of skill_ids the learner already knows")
    goal_skill_id: str = Field(..., description="Target skill_id the learner wants to reach")
    time_per_week_hours: Optional[int] = None


class ProfileResponse(BaseModel):
    user_id: str
    profile: Dict[str, Any]


# ---------- Chat intake ----------

class ChatIntakeRequest(BaseModel):
    message: str = Field(..., description="Learner's free-text description of their goal")


class ChatIntakeResponse(BaseModel):
    domain: Optional[str] = None
    known_skills: List[str] = Field(default_factory=list)
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
