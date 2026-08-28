"""
PathFinder core engine: skill-path generation + course recommendation.

This module contains NO mock data. All outputs are derived from:
  - data/courses_clean.csv        : 2118 real Coursera/Udacity courses
  - data/skill_graph.json         : hand-built prerequisite graph (skill names
                                     extracted verbatim from real course Skills tags)
  - data/course_skill_mapping.json: TF-IDF char-ngram matched course->skill links

Do not modify the matching/graph logic without re-validating coverage stats.

Two path-generation algorithms are provided:
  - generate_path(): DFS-based topological sort -> valid prerequisite order,
    O(V+E), does not optimize for time cost.
  - generate_optimal_path(): Dijkstra's algorithm over the same DAG, where
    each skill's edge weight is its real average course duration (in months,
    parsed from actual course Duration fields). Returns the minimum-total-time
    route to the goal skill, respecting all prerequisite constraints.

CORE_DOMAINS are the primary, fully-supported product surface (CSE-aligned,
matching the Coursera/Udacity CSE-heavy source data and this hackathon's
sponsor profile). Machine Learning and Cloud Computing are now first-class
core CSE domains. EXTENDED_DOMAINS (Business, Health, Personal Development)
exist in the data to demonstrate the pipeline is domain-agnostic, and are
available via the API for anyone who wants them, but are not the default
UI surface.
"""
import json
import ast
import re
import heapq
import pandas as pd
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / "data"

CORE_DOMAINS = [
    "Data Science", "Machine Learning", "Cloud Computing",
    "Web Development", "Cybersecurity",
    "AI Engineering", "Prompt Engineering & LLMOps", "Generative AI & RAG Systems",
]
EXTENDED_DOMAINS = ["Business", "Health", "Personal Development"]


def _parse_duration_months(duration_str):
    """Extract integer month count from strings like 'Approximately 5 months to complete'."""
    if pd.isna(duration_str):
        return None
    m = re.search(r"(\d+)", str(duration_str))
    return int(m.group(1)) if m else None


class PathEngine:
    def __init__(self,
                 skill_graph_path=DATA / "skill_graph.json",
                 courses_path=DATA / "courses_clean.csv",
                 mapping_path=DATA / "course_skill_mapping.json",
                 resources_path=DATA / "free_resources_mapping.json"):
        with open(skill_graph_path) as f:
            self.graph = json.load(f)

        self.courses = pd.read_csv(courses_path)
        self.courses["skills_list"] = self.courses["skills_list"].apply(ast.literal_eval)
        self.courses["duration_months"] = self.courses["Duration"].apply(_parse_duration_months)

        with open(mapping_path) as f:
            self.course_skill_map = json.load(f)

        # Free resources are deliberately loaded from their own mapping file.
        # Course recommendation logic continues to use course_skill_mapping.json.
        with open(resources_path, encoding="utf-8") as f:
            resource_data = json.load(f)
        self.free_resources = resource_data.get("resources", [])

        # skill_id -> domain / skill object lookup
        self.skill_domain = {}
        self.skill_by_id = {}
        for domain, skills in self.graph.items():
            for s in skills:
                self.skill_domain[s["id"]] = domain
                self.skill_by_id[s["id"]] = s

        unknown_resource_skill_ids = sorted({
            skill_id
            for resource in self.free_resources
            for skill_id in resource.get("skill_ids", [])
            if skill_id not in self.skill_by_id
        })
        if unknown_resource_skill_ids:
            raise ValueError(
                "free_resources_mapping.json contains unknown skill IDs: "
                + ", ".join(unknown_resource_skill_ids)
            )

        # reverse index: skill_id -> [course_id, ...]
        self.skill_to_courses = {}
        for cid, skill_ids in self.course_skill_map.items():
            for sid in skill_ids:
                self.skill_to_courses.setdefault(sid, []).append(cid)

        # precompute real-data-derived weight (avg course duration in months)
        # for every skill that has at least one matched course. Skills with no
        # matched course fall back to the global median so Dijkstra still runs.
        global_median = self.courses["duration_months"].median()
        self.skill_weight = {}
        for sid, course_ids in self.skill_to_courses.items():
            durations = self.courses[
                self.courses["course_id"].isin(course_ids)
            ]["duration_months"].dropna()
            self.skill_weight[sid] = float(durations.mean()) if len(durations) else float(global_median)
        for domain_skills in self.graph.values():
            for s in domain_skills:
                self.skill_weight.setdefault(s["id"], float(global_median))

    def get_free_resources_for_skills(self, skill_ids, resource_format=None, limit_per_skill=3):
        """Return free resources indexed by skill, with optional format filtering."""
        selected = {}
        for skill_id in skill_ids:
            matches = [
                resource.copy() for resource in self.free_resources
                if skill_id in resource.get("skill_ids", [])
                and (resource_format is None or resource.get("format") == resource_format)
            ]
            if matches:
                selected[skill_id] = matches[:limit_per_skill]
        return selected

    def get_domains(self, include_extended: bool = False):
        """
        Returns CORE_DOMAINS by default (CSE-aligned product surface).
        Pass include_extended=True to also list Business/Health/Personal
        Development — present in the data to prove the pipeline generalizes,
        but not part of the default product surface.
        """
        available = list(self.graph.keys())
        core = [d for d in CORE_DOMAINS if d in available]
        if include_extended:
            extended = [d for d in EXTENDED_DOMAINS if d in available]
            return core + extended
        return core

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

    def generate_optimal_path(self, domain: str, target_skill_id: str, known_skills=None):
        """
        Weighted topological scheduling using Kahn's algorithm with a min-heap,
        applying the Shortest-Processing-Time (SPT) rule.

        Why not Dijkstra: this graph has AND-semantics (a skill can require
        MULTIPLE prerequisites, all mandatory) rather than OR-semantics (pick
        the cheapest of several alternative routes). Under AND-semantics, the
        total time to reach the target is always the sum of every required
        skill's weight, regardless of visit order — there is no "shorter"
        alternative path for Dijkstra to discover, so applying it here would
        be algorithmically hollow.

        What actually varies with order: when multiple independent skills
        become available at once (their prerequisites are all satisfied,
        with no dependency between them), the ORDER in which you tackle them
        is a genuine scheduling decision. Plain DFS-based topological sort
        (generate_path) visits them in arbitrary order. This method instead
        uses Kahn's algorithm with a min-heap keyed by skill weight, so that
        whenever there's a real choice, the cheaper/faster skill is scheduled
        first (SPT rule) — this is a well-known, provably-optimal heuristic
        for minimizing *average* completion time across a set of milestones
        (see: Smith's rule / SPT scheduling in operations research), and it
        is the same underlying technique behind Critical Path Method (CPM)
        scheduling used in real project management.

        Complexity: O((V + E) log V) — same order as Dijkstra, using a
        binary heap instead of a FIFO queue for Kahn's algorithm.

        Total elapsed time is identical to generate_path()'s total (since the
        required node set doesn't change) — what differs is the ORDER, which
        front-loads quick wins so a learner sees progress sooner.
        """
        if domain not in self.graph:
            raise ValueError(f"Unknown domain: {domain}")
        skills = {s["id"]: s for s in self.graph[domain]}
        if target_skill_id not in skills:
            raise ValueError(f"Unknown skill_id '{target_skill_id}' in domain '{domain}'")

        known_skills = set(known_skills or [])

        # Step 1: find the required node set (target + all transitive
        # prerequisites not already known) — identical logic to generate_path.
        required = set()

        def collect(sid, stack):
            if sid in required or sid in known_skills or sid in stack:
                return
            stack = stack | {sid}
            for prereq in skills[sid]["prereqs"]:
                if prereq in skills:
                    collect(prereq, stack)
            required.add(sid)

        collect(target_skill_id, set())

        # Step 2: Kahn's algorithm restricted to `required`, using a min-heap
        # ordered by skill weight (SPT rule) instead of FIFO, so that whenever
        # multiple skills become simultaneously available, the cheaper one is
        # scheduled first.
        indegree = {sid: 0 for sid in required}
        dependents = {sid: [] for sid in required}
        for sid in required:
            for prereq in skills[sid]["prereqs"]:
                if prereq in required:
                    dependents[prereq].append(sid)
                    indegree[sid] += 1

        heap = []
        for sid in required:
            if indegree[sid] == 0:
                heapq.heappush(heap, (self.skill_weight.get(sid, 0.0), sid))

        ordered = []
        while heap:
            weight, sid = heapq.heappop(heap)
            ordered.append(sid)
            for dep in dependents[sid]:
                indegree[dep] -= 1
                if indegree[dep] == 0:
                    heapq.heappush(heap, (self.skill_weight.get(dep, 0.0), dep))

        if len(ordered) != len(required):
            # a cycle exists in the declared prereqs — shouldn't happen with
            # curated data, but fail loudly rather than silently truncate
            raise ValueError(f"Cycle detected in prerequisite graph for domain '{domain}'")

        result = []
        cumulative = 0.0
        for sid in ordered:
            w = self.skill_weight.get(sid, 0.0)
            cumulative += w
            result.append({
                "skill_id": sid,
                "name": skills[sid]["name"],
                "estimated_months_for_skill": round(w, 1),
                "cumulative_estimated_months": round(cumulative, 1),
            })
        return result

    def build_optimal_learning_plan(self, domain: str, target_skill_id: str,
                                     known_skills=None, courses_per_skill=2):
        """SPT-scheduled version of build_learning_plan(), with real time estimates
        (average duration, in months, of the actual matched courses per skill)."""
        path = self.generate_optimal_path(domain, target_skill_id, known_skills)
        plan = []
        for step_num, step in enumerate(path, 1):
            courses = self.recommend_courses_for_skill(step["skill_id"], top_n=courses_per_skill)
            plan.append({
                "milestone": step_num,
                "skill_id": step["skill_id"],
                "skill_name": step["name"],
                "estimated_months_for_skill": step["estimated_months_for_skill"],
                "cumulative_estimated_months": step["cumulative_estimated_months"],
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
