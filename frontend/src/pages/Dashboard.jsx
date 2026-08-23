import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import SkillPathMap from "../components/SkillPathMap";
import { api } from "../api";

// ML clarification — shown when goal is ML-related but domain is Data Science
const ML_SKILLS = ["machine learning", "deep learning", "tensorflow", "neural", "ai ", "artificial intelligence"];
function isMlGoal(goalName) {
  if (!goalName) return false;
  const lower = goalName.toLowerCase();
  return ML_SKILLS.some((kw) => lower.includes(kw));
}

/**
 * Dashboard — main output screen.
 * Shows skill learning path with two modes:
 *  - Standard: DFS topological sort (valid prerequisite order)
 *  - Time-Optimal: Kahn's algorithm + min-heap (SPT scheduling rule)
 *    Front-loads cheaper skills, shows real per-skill time estimates.
 */
export default function Dashboard({ profile, intake, onClearProfile }) {
  const navigate = useNavigate();

  // ── Path mode toggle ──────────────────────────────────────────────────────
  const [pathMode, setPathMode] = useState("standard"); // "standard" | "optimal"
  const [plan, setPlan] = useState(null);
  const [optimalMeta, setOptimalMeta] = useState(null); // total_estimated_months etc.
  const [planLoading, setPlanLoading] = useState(true);
  const [resourcesBySkill, setResourcesBySkill] = useState({});
  const [resourceFormat, setResourceFormat] = useState(null);

  // ── Progress ──────────────────────────────────────────────────────────────
  const [completedSkills, setCompletedSkills] = useState([]);
  const [progressData, setProgressData] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const { user_id, profile: p } = profile || {};

  // Handle session expiration
  const handleSessionExpired = useCallback(() => {
    onClearProfile?.();
    alert("Your session has expired (backend was restarted). Please create a new learning path.");
    navigate("/onboarding");
  }, [onClearProfile, navigate]);

  // Fetch path whenever mode changes
  useEffect(() => {
    if (!p) { navigate("/onboarding"); return; }
    setPlanLoading(true);
    setPlan(null);

    const params = {
      domain: p.domain,
      target_skill_id: p.goal_skill_id,
      known_skills: p.known_skills || [],
      courses_per_skill: 2,
    };

    const fetcher = pathMode === "optimal"
      ? api.getOptimalPath(params)
      : api.getPath(params);

    fetcher
      .then((res) => {
        setPlan(res.plan);
        if (pathMode === "optimal") {
          setOptimalMeta({
            total_months: res.total_estimated_months,
            caveat: res.duration_estimate_caveat,
            algorithm: res.algorithm,
          });
        } else {
          setOptimalMeta(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (err.message?.includes("404") || err.message?.includes("Session not found")) {
          handleSessionExpired();
        } else {
          setPlan([]);
        }
      })
      .finally(() => setPlanLoading(false));
  }, [p, pathMode, navigate, handleSessionExpired]);

  // Resource explanations are batched by the backend, so one request covers
  // the full path even when several milestones have matching resources.
  useEffect(() => {
    if (!p) return;
    const params = {
      domain: p.domain,
      target_skill_id: p.goal_skill_id,
      known_skills: p.known_skills || [],
      courses_per_skill: 2,
    };
    api.getFreeResourcesForPath(params, resourceFormat)
      .then((response) => setResourcesBySkill(response.resources_by_skill || {}))
      .catch((error) => {
        console.error("Could not load free resources", error);
        setResourcesBySkill({});
      });
  }, [p, resourceFormat]);

  // Toggle skill complete/incomplete
  const handleToggleSkill = useCallback(
    async (skillId) => {
      const updated = completedSkills.includes(skillId)
        ? completedSkills.filter((s) => s !== skillId)
        : [...completedSkills, skillId];

      setCompletedSkills(updated);
      setProgressLoading(true);
      try {
        const res = await api.updateProgress(user_id, updated);
        setProgressData(res);
      } catch (e) {
        console.error(e);
        if (e.message?.includes("404") || e.message?.includes("Session not found")) {
          handleSessionExpired();
        }
      } finally {
        setProgressLoading(false);
      }
    },
    [completedSkills, user_id, handleSessionExpired]
  );

  if (!profile) return null;

  const progressPercent = progressData?.progress_percent ?? 0;
  const totalCount = progressData?.total_count ?? plan?.length ?? 0;
  const completedCount = progressData?.completed_count ?? completedSkills.length;
  const goalName = intake?.goal_skill_name || plan?.find((m) => m.skill_id === p?.goal_skill_id)?.skill_name || p?.goal_skill_id;
  const showMlNote = p?.domain === "Data Science" && isMlGoal(goalName);

  return (
    <div className="page">
      <Navbar progress={progressPercent} />

      <div className="container" style={{ padding: "40px 24px 80px" }}>

        {/* Profile banner */}
        <div className="card card-glow animate-fade-up" style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
            <div>
              <div className="badge badge-accent" style={{ marginBottom: 12 }}>
                {p?.domain}
              </div>
              <h2 style={{ marginBottom: 6 }}>Hey {p?.name || "there"} 👋</h2>
              <p style={{ color: "var(--text-secondary)", maxWidth: 480 }}>
                Here's your personalized learning path to{" "}
                <strong style={{ color: "var(--text-primary)" }}>{goalName}</strong>.
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "var(--accent)", lineHeight: 1 }}>
                {progressPercent}%
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                {completedCount} / {totalCount} skills done
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        {/* ML clarification note */}
        {showMlNote && (
          <div
            className="animate-fade-up"
            style={{
              background: "rgba(0,212,170,0.07)",
              border: "1px solid var(--border-accent)",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              marginBottom: 24,
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>Machine Learning path:</strong>{" "}
            ML engineering is covered within our Data Science domain — your path includes{" "}
            <strong style={{ color: "var(--accent)" }}>Machine Learning, Linear Regression, Deep Learning, and TensorFlow</strong>{" "}
            as dedicated milestones, built on real Coursera prerequisites.
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 36 }} className="stagger">
          {[
            { label: "Total milestones", val: totalCount },
            { label: "Completed", val: completedCount },
            { label: "Remaining", val: totalCount - completedCount },
            { label: "Hours/week", val: p?.time_per_week_hours || "—" },
          ].map((s) => (
            <div key={s.label} className="card animate-fade-up">
              <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "var(--text-primary)" }}>
                {s.val}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Path mode toggle + header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontSize: "1.4rem" }}>Your Learning Path</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Algorithm toggle */}
            <div
              style={{
                display: "flex",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              {[
                { key: "standard", label: "Standard", title: "DFS topological sort — valid prerequisite order" },
                { key: "optimal", label: "Time-optimal", title: "Kahn's algorithm + min-heap (SPT scheduling) — front-loads faster skills" },
              ].map((m) => (
                <button
                  key={m.key}
                  title={m.title}
                  onClick={() => setPathMode(m.key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    background: pathMode === m.key ? "var(--accent)" : "transparent",
                    color: pathMode === m.key ? "#000" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
              Click <strong style={{ color: "var(--accent)" }}>Done</strong> to mark complete.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "-8px 0 20px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Free resource format:</span>
          {[
            { value: null, label: "All" },
            { value: "video", label: "Video" },
            { value: "reading", label: "Reading" },
            { value: "interactive", label: "Interactive" },
            { value: "reference", label: "Reference" },
          ].map((filter) => (
            <button
              key={filter.label}
              className={`btn btn-sm ${resourceFormat === filter.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setResourceFormat(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Optimal mode info banner */}
        {pathMode === "optimal" && optimalMeta && !planLoading && (
          <div
            className="animate-fade-up"
            style={{
              background: "rgba(0,212,170,0.07)",
              border: "1px solid var(--border-accent)",
              borderRadius: "var(--radius-md)",
              padding: "12px 18px",
              marginBottom: 20,
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span>
              <strong style={{ color: "var(--accent)" }}>{optimalMeta.algorithm}</strong>
              {" — "}skills scheduled by estimated duration, shortest first.
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Est. total: ~{optimalMeta.total_months?.toFixed(1)} months*
            </span>
          </div>
        )}

        {/* Path */}
        <SkillPathMap
          plan={plan}
          completedSkills={completedSkills}
          onToggleSkill={handleToggleSkill}
          domain={p?.domain}
          goal={goalName}
          loading={planLoading}
          showTimeEstimates={pathMode === "optimal"}
          resourcesBySkill={resourcesBySkill}
        />

        {/* Optimal caveat footnote */}
        {pathMode === "optimal" && optimalMeta && !planLoading && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 12, fontStyle: "italic" }}>
            * {optimalMeta.caveat}
          </p>
        )}

        {/* Start over */}
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <button
            className="btn btn-secondary"
            onClick={() => { onClearProfile?.(); navigate("/onboarding"); }}
          >
            Start a new path
          </button>
        </div>
      </div>
    </div>
  );
}
