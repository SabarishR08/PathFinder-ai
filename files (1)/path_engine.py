"""
PathFinder core engine: skill-path generation + course recommendation.

Inputs:
  - skill_graph.json        : domain -> [{id, name, prereqs[]}]
  - courses_clean.csv       : cleaned course catalog (979 real Coursera/Udacity rows)
  - course_skill_mapping.json : course_id -> [skill_id, ...] (TF-IDF char-ngram matched)

Usage:
  engine = PathEngine()
  path = engine.generate_path(domain="Data Science", target_skill_id="ds_ml", known_skills=["ds_python"])
  courses = engine.recommend_courses_for_skill("ds_ml")
"""
import json
import ast
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent


class PathEngine:
    def __init__(self,
                 skill_graph_path=BASE / "skill_graph.json",
                 courses_path=BASE / "courses_clean.csv",
                 mapping_path=BASE / "course_skill_mapping.json"):
        with open(skill_graph_path) as f:
            self.graph = json.load(f)

        self.courses = pd.read_csv(courses_path)
        self.courses["skills_list"] = self.courses["skills_list"].apply(ast.literal_eval)

        with open(mapping_path) as f:
            self.course_skill_map = json.load(f)

        # skill_id -> domain lookup
        self.skill_domain = {}
        self.skill_by_id = {}
        for domain, skills in self.graph.items():
            for s in skills:
                self.skill_domain[s["id"]] = domain
                self.skill_by_id[s["id"]] = s

        # reverse index: skill_id -> [course_id, ...]
        self.skill_to_courses = {}
        for cid, skill_ids in self.course_skill_map.items():
            for sid in skill_ids:
                self.skill_to_courses.setdefault(sid, []).append(cid)

    def generate_path(self, domain: str, target_skill_id: str, known_skills=None):
        """Topological-sort prerequisite chain to a target skill, skipping known skills."""
        known_skills = set(known_skills or [])
        skills = {s["id"]: s for s in self.graph[domain]}
        ordered = []

        def visit(sid, stack):
            if sid in ordered or sid in known_skills:
                return
            if sid in stack:
                return  # cycle guard
            stack = stack | {sid}
            for prereq in skills[sid]["prereqs"]:
                visit(prereq, stack)
            if sid not in ordered:
                ordered.append(sid)

        visit(target_skill_id, set())
        return [{"skill_id": sid, "name": skills[sid]["name"]} for sid in ordered]

    def recommend_courses_for_skill(self, skill_id: str, top_n=5, min_rating=0):
        """Return best-rated courses that teach a given skill."""
        course_ids = self.skill_to_courses.get(skill_id, [])
        if not course_ids:
            return []
        subset = self.courses[self.courses["course_id"].isin(course_ids)].copy()
        subset = subset[subset["Rating"].fillna(0) >= min_rating]
        subset = subset.sort_values("Rating", ascending=False)
        return subset[["course_id", "Title", "Site", "Level", "Rating", "URL"]].head(top_n).to_dict("records")

    def build_learning_plan(self, domain: str, target_skill_id: str, known_skills=None, courses_per_skill=2):
        """Full pipeline: path of skills, each with recommended courses (milestones)."""
        path = self.generate_path(domain, target_skill_id, known_skills)
        plan = []
        for step_num, step in enumerate(path, 1):
            courses = self.recommend_courses_for_skill(step["skill_id"], top_n=courses_per_skill)
            plan.append({
                "milestone": step_num,
                "skill_id": step["skill_id"],
                "skill_name": step["name"],
                "recommended_courses": courses
            })
        return plan


if __name__ == "__main__":
    engine = PathEngine()
    plan = engine.build_learning_plan(
        domain="Data Science",
        target_skill_id="ds_ml",
        known_skills=["ds_python"]  # learner already knows Python
    )
    for m in plan:
        print(f"\nMilestone {m['milestone']}: {m['skill_name']}")
        for c in m["recommended_courses"]:
            print(f"   - {c['Title']} ({c['Site']}, {c['Rating']}★)")
