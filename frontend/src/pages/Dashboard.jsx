import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import SkillPathMap from "../components/SkillPathMap";
import { api } from "../api";

const DOMAIN_ICONS = {
  "Data Science": "📊",
  "Machine Learning": "🤖",
  "Web Development": "🌐",
  "Cybersecurity": "🔐",
  "Computer Science": "💻",
  "Business": "💼",
  "Graphic Design": "🎨",
  "Personal Development": "🧠",
  "Health": "❤️",
  "Mathematics": "📐",
};

/**
 * Dashboard — the main output screen.
 * Shows the full skill learning path, progress tracker, and plan stats.
 */
export default function Dashboard({ profile, intake, onClearProfile }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [completedSkills, setCompletedSkills] = useState([]);
  const [progressData, setProgressData] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const { user_id, profile: p } = profile || {};

  // Handle session expiration (backend restart invalidates user_id)
  const handleSessionExpired = useCallback(() => {
    onClearProfile?.();
    alert("Your session has expired (backend was restarted). Please create a new learning path.");
    navigate("/onboarding");
  }, [onClearProfile, navigate]);

  // Fetch the initial path on mount
  useEffect(() => {
    if (!p) { navigate("/onboarding"); return; }
    setPlanLoading(true);
    api
      .getPath({
        domain: p.domain,
        target_skill_id: p.goal_skill_id,
        known_skills: p.known_skills || [],
        courses_per_skill: 2,
      })
      .then((res) => {
        setPlan(res.plan);
      })
      .catch((err) => {
        console.error(err);
        // Check if it's a 404 (unknown user_id after backend restart)
        if (err.message?.includes("404") || err.message?.includes("Unknown user_id")) {
          handleSessionExpired();
        } else {
          setPlan([]);
        }
      })
      .finally(() => setPlanLoading(false));
  }, [p, navigate, handleSessionExpired]);

  // Toggle a skill complete/incomplete and call /api/progress
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
        // Check if it's a 404 (unknown user_id after backend restart)
        if (e.message?.includes("404") || e.message?.includes("Unknown user_id")) {
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

  const domainIcon = DOMAIN_ICONS[p?.domain] || "📚";

  return (
    <div className="page">
      <Navbar progress={progressPercent} />

      <div className="container" style={{ padding: "40px 24px 80px" }}>
        {/* Profile banner */}
        <div
          className="card card-glow animate-fade-up"
          style={{ marginBottom: 36 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <div>
              <div
                className="badge badge-accent"
                style={{ marginBottom: 12 }}
              >
                {domainIcon} {p?.domain}
              </div>
              <h2 style={{ marginBottom: 6 }}>
                Hey {p?.name || "there"} 👋
              </h2>
              <p style={{ color: "var(--text-secondary)", maxWidth: 480 }}>
                Here's your personalized learning path to{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {intake?.goal_skill_name ||
                    plan?.find((m) => m.skill_id === p?.goal_skill_id)
                      ?.skill_name ||
                    p?.goal_skill_id}
                </strong>
                .
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              {/* Progress circle-ish stat */}
              <div
                style={{
                  fontSize: "2.5rem",
                  fontWeight: 800,
                  fontFamily: "Space Grotesk, sans-serif",
                  color: "var(--accent)",
                  lineHeight: 1,
                }}
              >
                {progressPercent}%
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                {completedCount} / {totalCount} skills done
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 20 }}>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
            marginBottom: 36,
          }}
          className="stagger"
        >
          {[
            { label: "Total milestones", val: totalCount, icon: "🎯" },
            { label: "Completed", val: completedCount, icon: "✅" },
            { label: "Remaining", val: totalCount - completedCount, icon: "⏳" },
            {
              label: "Hours/week",
              val: p?.time_per_week_hours || "—",
              icon: "🕐",
            },
          ].map((s) => (
            <div key={s.label} className="card animate-fade-up">
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{s.icon}</div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 700,
                  fontFamily: "Space Grotesk, sans-serif",
                  color: "var(--text-primary)",
                }}
              >
                {s.val}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Hint */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2 style={{ fontSize: "1.4rem" }}>Your Learning Path</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Click <strong style={{ color: "var(--accent)" }}>Done</strong> on
            each step or tap the milestone number to mark complete.
          </p>
        </div>

        {/* Path */}
        <SkillPathMap
          plan={plan}
          completedSkills={completedSkills}
          onToggleSkill={handleToggleSkill}
          domain={p?.domain}
          goal={intake?.goal_skill_name || p?.goal_skill_id}
          loading={planLoading}
        />

        {/* Start over */}
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              onClearProfile?.();
              navigate("/onboarding");
            }}
          >
            ← Start a new path
          </button>
        </div>
      </div>
    </div>
  );
}
