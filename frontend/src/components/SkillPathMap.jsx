import { useState } from "react";
import ExplainModal from "./ExplainModal";

const SITE_COLORS = {
  Coursera: "#0056d2",
  Udacity: "#02b3e4",
  default: "var(--text-muted)",
};

const SITE_ICONS = {
  Coursera: "🎓",
  Udacity: "🚀",
  default: "📘",
};

function CourseChip({ course }) {
  const icon = SITE_ICONS[course.Site] || SITE_ICONS.default;
  const rating = course.Rating ? course.Rating.toFixed(1) : null;

  return (
    <div className="course-chip">
      {course.URL ? (
        <a href={course.URL} target="_blank" rel="noopener noreferrer">
          {course.Title}
        </a>
      ) : (
        <span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: "0.9rem", display: "block", marginBottom: 4 }}>
          {course.Title}
        </span>
      )}
      <div className="course-meta">
        <span>{icon} {course.Site}</span>
        {rating && (
          <>
            <span>·</span>
            <span className="star-rating">★ {rating}</span>
          </>
        )}
        {course.Level && course.Level !== "Not specified" && (
          <>
            <span>·</span>
            <span>{course.Level}</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * SkillPathMap — renders the full milestone timeline with expandable course cards
 * and an "Explain" button that triggers the LLM reasoning modal.
 */
export default function SkillPathMap({
  plan,
  completedSkills,
  onToggleSkill,
  domain,
  goal,
  loading,
  showTimeEstimates = false,
}) {
  const [explainSkill, setExplainSkill] = useState(null);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: "60px 0",
          color: "var(--text-secondary)",
        }}
      >
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
        <p>Building your personalized learning path...</p>
      </div>
    );
  }

  if (!plan || plan.length === 0) {
    return (
      <div className="alert alert-warning" style={{ marginTop: 24 }}>
        ⚠️ No path generated. Try choosing a different target skill or reducing known skills.
      </div>
    );
  }

  const firstIncompleteIdx = plan.findIndex(
    (m) => !completedSkills.includes(m.skill_id)
  );

  return (
    <>
      <div className="path-timeline">
        {plan.map((milestone, idx) => {
          const isCompleted = completedSkills.includes(milestone.skill_id);
          const isActive = !isCompleted && idx === firstIncompleteIdx;

          return (
            <div
              key={milestone.skill_id}
              className="milestone-card animate-fade-up"
              style={{ animationDelay: `${idx * 0.06}s` }}
            >
              {/* Step dot */}
              <div
                className={`milestone-dot ${isCompleted ? "completed" : isActive ? "active" : ""}`}
                onClick={() => onToggleSkill(milestone.skill_id)}
                style={{ cursor: "pointer" }}
                title={isCompleted ? "Mark incomplete" : "Mark complete"}
              >
                {isCompleted ? "✓" : milestone.milestone}
              </div>

              {/* Card body */}
              <div className="milestone-body">
                <div className="milestone-header">
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Step {milestone.milestone}
                    </div>
                    <div className="milestone-title">
                      {isCompleted && <span style={{ color: "var(--accent)", marginRight: 8 }}>✓</span>}
                      {milestone.skill_name}
                    </div>
                    {showTimeEstimates && milestone.estimated_months_for_skill && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
                        ⏱ ~{milestone.estimated_months_for_skill} mo
                        {milestone.cumulative_estimated_months && (
                          <span style={{ marginLeft: 8, color: "var(--accent)", opacity: 0.7 }}>
                            ({milestone.cumulative_estimated_months} mo cumulative)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExplainSkill(milestone.skill_name)}
                      title="Why is this skill recommended?"
                    >
                      💡 Why?
                    </button>
                    <button
                      className={`btn btn-sm ${isCompleted ? "btn-secondary" : "btn-primary"}`}
                      onClick={() => onToggleSkill(milestone.skill_id)}
                    >
                      {isCompleted ? "Undo" : "Done"}
                    </button>
                  </div>
                </div>

                {/* Courses */}
                {milestone.recommended_courses.length > 0 ? (
                  <div className="course-grid">
                    {milestone.recommended_courses.map((c) => (
                      <CourseChip key={c.course_id} course={c} />
                    ))}
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    No courses matched yet for this skill.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explain modal */}
      {explainSkill && (
        <ExplainModal
          skill={explainSkill}
          domain={domain}
          goal={goal}
          onClose={() => setExplainSkill(null)}
        />
      )}
    </>
  );
}
