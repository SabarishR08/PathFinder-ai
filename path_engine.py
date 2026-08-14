"""
PathFinder core engine: skill-path generation + course recommendation.

This module contains NO mock data. All outputs are derived from:
  - data/courses_clean.csv        : 979 real Coursera/Udacity courses
  - data/skill_graph.json         : hand-built prerequisite graph (skill names
                                     extracted verbatim from real course Skills tags)
  - data/course_skill_mapping.json: TF-IDF char-ngram matched course->skill links

Do not modify the matching/graph logic without re-validating coverage stats.
"""
import json
import ast
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / "data"


class PathEngine:
    def __init__(self,
                 skill_graph_path=DATA / "skill_graph.json",
                 courses_path=DATA / "courses_clean.csv",
                 mapping_path=DATA / "course_skill_mapping.json"):
        with open(skill_graph_path) as f:
            self.graph = json.load(f)

        self.courses = pd.read_csv(courses_path)
        self.courses["skills_list"] = self.courses["skills_list"].apply(ast.literal_eval)

        with open(mapping_path) as f:
            self.course_skill_map = json.load(f)

        # skill_id -> domain / skill object lookup
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

    def get_domains(self):
        return list(self.graph.keys())

    def get_skills(self, domain: str):
        if domain not in self.graph:
            return []
        return self.graph[domain]

    def find_skill_id_by_name(self, domain: str, name_fragment: str):
        """Best-effort fuzzy lookup: exact match first, then substring match."""
        if domain not in self.graph:
            return None
        name_fragment_l = name_fragment.strip().lower()
        skills = self.graph[domain]

        for s in skills:
            if s["name"].lower() == name_fragment_l:
                return s["id"]
        for s in skills:
            if name_fragment_l in s["name"].lower() or s["name"].lower() in name_fragment_l:
                return s["id"]
        return None

    def generate_path(self, domain: str, target_skill_id: str, known_skills=None):
        """Topological-sort prerequisite chain to a target skill, skipping known skills."""
        if domain not in self.graph:
            raise ValueError(f"Unknown domain: {domain}")
        skills = {s["id"]: s for s in self.graph[domain]}
        if target_skill_id not in skills:
            raise ValueError(f"Unknown skill_id '{target_skill_id}' in domain '{domain}'")

        known_skills = set(known_skills or [])
        ordered = []

        def visit(sid, stack):
            if sid in ordered or sid in known_skills:
                return
            if sid in stack:
                return  # cycle guard
            stack = stack | {sid}
            for prereq in skills[sid]["prereqs"]:
                if prereq in skills:  # guard against dangling refs
                    visit(prereq, stack)
            if sid not in ordered:
                ordered.append(sid)

        visit(target_skill_id, set())
        return [{"skill_id": sid, "name": skills[sid]["name"]} for sid in ordered]

    def recommend_courses_for_skill(self, skill_id: str, top_n=5, min_rating=0):
        """Return best-rated real courses that teach a given skill."""
        course_ids = self.skill_to_courses.get(skill_id, [])
        if not course_ids:
            return []
        subset = self.courses[self.courses["course_id"].isin(course_ids)].copy()
        subset["Rating"] = subset["Rating"].fillna(0)
        subset = subset[subset["Rating"] >= min_rating]
        subset = subset.sort_values("Rating", ascending=False)
        subset["Level"] = subset["Level"].fillna("Not specified")
        subset["URL"] = subset["URL"].fillna("")
        cols = ["course_id", "Title", "Site", "Level", "Rating", "URL", "domain"]
        return subset[cols].head(top_n).to_dict("records")

    def build_learning_plan(self, domain: str, target_skill_id: str,
                             known_skills=None, courses_per_skill=2):
        """Full pipeline: ordered skill path, each with recommended real courses."""
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

    def get_prereq_chain_text(self, domain: str, skill_id: str):
        """Human-readable prereq chain, used to ground LLM explanations (no hallucination)."""
        skills = {s["id"]: s for s in self.graph[domain]}
        if skill_id not in skills:
            return ""
        chain = []
        seen = set()

        def visit(sid):
            if sid in seen:
                return
            seen.add(sid)
            for p in skills[sid]["prereqs"]:
                if p in skills:
                    visit(p)
            chain.append(skills[sid]["name"])

        visit(skill_id)
        return " -> ".join(chain)


if __name__ == "__main__":
    engine = PathEngine()
    plan = engine.build_learning_plan(
        domain="Data Science",
        target_skill_id="ds_ml",
        known_skills=["ds_python"]
    )
    for m in plan:
        print(f"\nMilestone {m['milestone']}: {m['skill_name']}")
        for c in m["recommended_courses"]:
            print(f"   - {c['Title']} ({c['Site']}, {c['Rating']}★)")
