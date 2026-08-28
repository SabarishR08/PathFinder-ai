import { useState, useCallback } from "react";
import { api } from "../api";

/**
 * RiskAssessment — ML-powered completion-risk prediction panel.
 *
 * Uses the trained LightGBM model on OULAD data (86.5% accuracy) to predict
 * whether a learner is at risk of not completing their learning path.
 * Shows risk band + feature importance breakdown.
 */

const RISK_BAND_COLORS = {
  low: { bg: "rgba(0,212,170,0.12)", border: "var(--accent)", text: "#00d4aa", label: "Low Risk" },
  medium: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", text: "#fbbf24", label: "Medium Risk" },
  high: { bg: "rgba(239,68,68,0.12)", border: "#ef4444", text: "#f87171", label: "High Risk" },
};

const DEFAULT_PROFILE = {
  gender: "M",
  region: "London",
  highest_education: "HE Qualification",
  imd_band: "50-60%",
  age_band: "0-35",
  disability: "N",
  num_of_prev_attempts: 0,
  studied_credits: 120,
  avg_score: 70,
  num_assessments: 3,
  total_clicks: 500,
  avg_clicks: 15,
};

const FIELD_GROUPS = [
  {
    title: "Demographics",
    fields: [
      { key: "gender", label: "Gender", type: "select", options: ["M", "F"] },
      { key: "age_band", label: "Age Band", type: "select", options: ["0-35", "35-55", "55<="] },
      { key: "disability", label: "Disability", type: "select", options: ["N", "Y"] },
    ],
  },
  {
    title: "Academic Background",
    fields: [
      { key: "highest_education", label: "Education Level", type: "select", options: ["HE Qualification", "A Level or Equivalent", "Lower Than A Level", "Post Graduate Qualification", "No Formal quals"] },
      { key: "region", label: "Region", type: "select", options: ["London", "South East", "South West", "Midlands", "North West", "North East", "Yorkshire", "East Anglia", "Wales", "Scotland", "Ireland"] },
      { key: "imd_band", label: "IMD Band", type: "select", options: ["0-10%", "10-20%", "20-30%", "30-40%", "40-50%", "50-60%", "60-70%", "70-80%", "80-90%", "90-100%"] },
    ],
  },
  {
    title: "Engagement",
    fields: [
      { key: "num_of_prev_attempts", label: "Prior Attempts", type: "number", min: 0, max: 10 },
      { key: "studied_credits", label: "Studied Credits", type: "number", min: 30, max: 360, step: 30 },
      { key: "avg_score", label: "Avg Score (%)", type: "number", min: 0, max: 100 },
      { key: "num_assessments", label: "Assessments Done", type: "number", min: 0, max: 20 },
      { key: "total_clicks", label: "Total VLE Clicks", type: "number", min: 0, max: 5000, step: 50 },
      { key: "avg_clicks", label: "Avg Clicks/Week", type: "number", min: 0, max: 200, step: 5 },
    ],
  },
];

export default function RiskAssessment() {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_PROFILE });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shapResult, setShapResult] = useState(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [shapError, setShapError] = useState(null);

  const handleChange = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = { ...form };
      // Convert numeric fields
      ["num_of_prev_attempts", "studied_credits", "avg_score", "num_assessments", "total_clicks", "avg_clicks"].forEach((k) => {
        payload[k] = Number(payload[k]);
      });
      const res = await api.getRiskScore(payload);
      setResult(res);
      setShapResult(null);
      setShapError(null);
    } catch (e) {
      setError(e.message || "Failed to get risk prediction");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const handleShapExplain = useCallback(async () => {
    setShapLoading(true);
    setShapError(null);
    try {
      const payload = { ...form };
      ["num_of_prev_attempts", "studied_credits", "avg_score", "num_assessments", "total_clicks", "avg_clicks"].forEach((k) => {
        payload[k] = Number(payload[k]);
      });
      const res = await api.shapExplain(payload);
      setShapResult(res);
    } catch (e) {
      setShapError(e.message || "SHAP explanation unavailable");
    } finally {
      setShapLoading(false);
    }
  }, [form]);

  const riskInfo = result ? RISK_BAND_COLORS[result.risk_band] : null;
  const riskPercent = result ? Math.round(result.risk_score * 100) : 0;

  return (
    <div
      className="card animate-fade-up"
      style={{ marginBottom: 24, overflow: "hidden", transition: "all 0.3s ease" }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))",
              border: "1px solid rgba(139,92,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
            }}
          >
            🧠
          </div>
          <div>
            <h3 style={{ fontSize: "1.05rem", marginBottom: 2 }}>
              ML Risk Assessment
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
              LightGBM model trained on 32,593 students · 86.5% accuracy
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", marginTop: 2, fontStyle: "italic" }}>
              Trained on OULAD (UK Open University data, 2013-14 cohorts). Region/education fields reflect the UK schema.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {result && (
            <div
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                background: riskInfo.bg,
                border: `1px solid ${riskInfo.border}`,
                color: riskInfo.text,
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              {riskInfo.label}
            </div>
          )}
          <span
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.2s",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {isOpen && (
        <div style={{ marginTop: 20, animation: "fadeUp 0.3s ease" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: result ? "1fr 1fr" : "1fr",
              gap: 24,
              alignItems: "start",
            }}
          >
            {/* Left: Form */}
            <div>
              {FIELD_GROUPS.map((group) => (
                <div key={group.title} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    {group.title}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {group.fields.map((field) => (
                      <div key={field.key} className="form-group">
                        <label className="form-label" style={{ fontSize: "0.72rem" }}>
                          {field.label}
                        </label>
                        {field.type === "select" ? (
                          <select
                            className="select"
                            value={form[field.key]}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                          >
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            className="input"
                            value={form[field.key]}
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                className="btn btn-primary btn-sm"
                onClick={handlePredict}
                disabled={loading}
                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    Predicting...
                  </>
                ) : (
                  "🔮 Predict Risk"
                )}
              </button>

              {error && (
                <div className="alert alert-error" style={{ marginTop: 12, fontSize: "0.85rem" }}>
                  {error}
                </div>
              )}
            </div>

            {/* Right: Results */}
            {result && (
              <div>
                {/* Data source warning banner */}
                {result.data_source_warning && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(245,158,11,0.1)",
                      border: "1px solid rgba(245,158,11,0.3)",
                      color: "#fbbf24",
                      fontSize: "0.82rem",
                      marginBottom: 16,
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ {result.data_source_warning}
                  </div>
                )}

                {/* Risk gauge */}
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px 16px",
                    borderRadius: "var(--radius-lg)",
                    background: riskInfo.bg,
                    border: `1px solid ${riskInfo.border}`,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: "3rem",
                      fontWeight: 800,
                      fontFamily: "Space Grotesk, sans-serif",
                      color: riskInfo.text,
                      lineHeight: 1,
                    }}
                  >
                    {riskPercent}%
                  </div>
                  <div style={{ color: riskInfo.text, fontWeight: 600, fontSize: "0.9rem", marginTop: 4 }}>
                    {riskInfo.label}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
                    Probability of non-completion
                  </div>

                  {/* Risk bar */}
                  <div
                    style={{
                      marginTop: 12,
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${riskPercent}%`,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, #00d4aa, ${riskInfo.text})`,
                        transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.65rem",
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    <span>0% (Safe)</span>
                    <span>100% (At Risk)</span>
                  </div>
                </div>

                {/* Feature importance */}
                {result.feature_importance && result.feature_importance.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 10,
                      }}
                    >
                      Feature Importance
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {result.feature_importance.slice(0, 8).map((fi, i) => {
                        const maxImportance = result.feature_importance[0].importance;
                        const barWidth = maxImportance > 0 ? (fi.importance / maxImportance) * 100 : 0;
                        const colors = ["#00d4aa", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
                        const color = colors[i % colors.length];
                        return (
                          <div key={fi.feature} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 100,
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                textAlign: "right",
                                flexShrink: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={fi.feature}
                            >
                              {fi.feature.replace(/_/g, " ")}
                            </div>
                            <div
                              style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.06)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${barWidth}%`,
                                  borderRadius: 999,
                                  background: color,
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                width: 36,
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            >
                              {Math.round(fi.importance * 100)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SHAP Explain button */}
                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleShapExplain}
                    disabled={shapLoading}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {shapLoading ? (
                      <>
                        <div className="spinner" style={{ width: 14, height: 14 }} />
                        Computing SHAP values...
                      </>
                    ) : shapResult ? (
                      "🔄 Recompute SHAP explanation"
                    ) : (
                      "🔍 Why this prediction? (SHAP)"
                    )}
                  </button>
                </div>

                {/* SHAP explanation */}
                {shapResult && (
                  <div style={{ marginTop: 16, animation: "fadeUp 0.3s ease" }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 10,
                      }}
                    >
                      SHAP Feature Contributions
                    </div>

                    {/* Summary */}
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(139,92,246,0.06)",
                        border: "1px solid rgba(139,92,246,0.2)",
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        marginBottom: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {shapResult.summary}
                    </div>

                    {/* Waterfall chart */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {shapResult.contributions.slice(0, 8).map((c, i) => {
                        const maxAbs = Math.abs(shapResult.contributions[0].shap_value) || 1;
                        const barWidth = Math.min(100, (Math.abs(c.shap_value) / maxAbs) * 100);
                        const isPositive = c.shap_value > 0;
                        const color = isPositive ? "#00d4aa" : "#ef4444";
                        const shapColors = ["#00d4aa", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
                        const barColor = shapColors[i % shapColors.length];

                        return (
                          <div key={c.feature} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 100,
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                textAlign: "right",
                                flexShrink: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={`${c.feature} = ${c.feature_value}`}
                            >
                              {c.feature.replace(/_/g, " ")}
                            </div>

                            {/* Centered bar (negative left, positive right) */}
                            <div
                              style={{
                                flex: 1,
                                height: 8,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.04)",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  height: "100%",
                                  width: `${barWidth}%`,
                                  borderRadius: 999,
                                  background: barColor,
                                  ...(isPositive
                                    ? { left: "50%" }
                                    : { right: "50%" }),
                                  transition: "width 0.5s ease",
                                }}
                              />
                              {/* Center line */}
                              <div
                                style={{
                                  position: "absolute",
                                  left: "50%",
                                  top: 0,
                                  width: 1,
                                  height: "100%",
                                  background: "rgba(255,255,255,0.2)",
                                }}
                              />
                            </div>

                            <div
                              style={{
                                width: 60,
                                fontSize: "0.7rem",
                                color: isPositive ? "#00d4aa" : "#f87171",
                                flexShrink: 0,
                                fontWeight: 500,
                              }}
                            >
                              {isPositive ? "+" : ""}{c.shap_value.toFixed(3)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 16,
                        marginTop: 8,
                        fontSize: "0.65rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>← Increases risk</span>
                      <span style={{ color: "var(--text-secondary)" }}>|</span>
                      <span>Helps pass →</span>
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: "0.65rem",
                        color: "var(--text-muted)",
                        textAlign: "center",
                      }}
                    >
                      Base value: {shapResult.base_value.toFixed(3)} · Final prediction: {shapResult.prediction.toFixed(3)} ({shapResult.risk_band} risk)
                    </div>
                  </div>
                )}

                {shapError && (
                  <div className="alert alert-error" style={{ marginTop: 12, fontSize: "0.8rem" }}>
                    {shapError}
                  </div>
                )}

                {/* Model citation */}
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    fontSize: "0.7rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: "var(--text-secondary)" }}>Model:</strong> LightGBM classifier trained on{" "}
                  <span style={{ color: "var(--accent)" }}>OULAD</span> (Open University Learning Analytics Dataset,
                  32,593 students). Accuracy: {result.model_accuracy}, F1: {result.model_f1}.
                  Behavioral signals (assessments, engagement) dominate over demographics.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
