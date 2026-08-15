import { useState, useEffect } from "react";
import { api } from "../api";

/**
 * ExplainModal — calls /api/explain and renders the LLM's grounded reasoning
 * for why a specific skill is recommended at this point in the path.
 */
export default function ExplainModal({ skill, domain, goal, onClose }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchExplanation() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.explain({
        skill_name: skill,
        domain,
        learner_goal: goal || "",
      });
      setExplanation(res.explanation);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    fetchExplanation();
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <div
              className="badge badge-accent"
              style={{ marginBottom: 8 }}
            >
              Why this skill?
            </div>
            <h3 style={{ color: "var(--text-primary)" }}>{skill}</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              width: 36,
              height: 36,
              cursor: "pointer",
              fontSize: "1.2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: "var(--text-secondary)",
              padding: "20px 0",
            }}
          >
            <div className="spinner" />
            <span>Generating explanation...</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            ⚠️ {error.startsWith("LLM_ERROR") ? "LLM unavailable — check your GROQ_API_KEY" : error}
          </div>
        )}

        {explanation && !loading && (
          <div
            style={{
              background: "rgba(0,212,170,0.06)",
              border: "1px solid var(--border-accent)",
              borderRadius: "var(--radius-md)",
              padding: "20px 24px",
              lineHeight: 1.75,
              color: "var(--text-primary)",
              fontSize: "0.97rem",
            }}
          >
            <span style={{ fontSize: "1.5rem", marginRight: 8 }}>💡</span>
            {explanation}
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
