import { useState } from "react";
import ExplainModal from "./ExplainModal";

function CourseChip({ course }) {
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
        <span>{course.Site}</span>
        {rating && (
          <>
            <span>·</span>
            <span className="star-rating">Rating {rating}</span>
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

function ResourceCard({ resource }) {
  const typeLabel = resource.resource_type.replaceAll("_", " ");
  const stars = resource.metadata?.stars;
  const checkedOn = resource.metadata?.checked_on;
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="course-chip"
      style={{ textDecoration: "none", borderColor: "var(--border-accent)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{resource.title}</span>
        <span className="badge badge-accent" style={{ fontSize: "0.65rem" }}>FREE</span>
      </div>
      <div className="course-meta">
        <span>{resource.provider}</span><span>·</span><span>{typeLabel}</span>
        {stars && <><span>·</span><span>{(stars / 1000).toFixed(1)}k stars</span></>}
        {checkedOn && <><span>·</span><span>checked {checkedOn}</span></>}
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "8px 0 0", lineHeight: 1.45 }}>
        {resource.why_this_resource}
      </p>
    </a>
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
  resourcesBySkill = {},
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
        No path generated. Try a different target skill or adjust the skills you already know.
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
                {isCompleted ? "Done" : milestone.milestone}
              </div>

              {/* Card body */}
              <div className="milestone-body">
                <div className="milestone-header">
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Step {milestone.milestone}
                    </div>
                    <div className="milestone-title">
                      {milestone.skill_name}
                    </div>
                    {showTimeEstimates && milestone.estimated_months_for_skill && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
                        Estimated {milestone.estimated_months_for_skill} mo
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
                      Why this skill
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

                {resourcesBySkill[milestone.skill_id]?.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 8 }}>
                      FREE RESOURCES
                    </div>
                    <div className="course-grid">
                      {resourcesBySkill[milestone.skill_id].map((resource) => (
                        <ResourceCard key={resource.resource_id} resource={resource} />
                      ))}
                    </div>
                  </div>
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
