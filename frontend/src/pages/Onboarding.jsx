import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../api";

const DOMAINS = ["Data Science", "Web Development", "Cybersecurity"];

/**
 * Onboarding — two paths:
 *  1. Chat intake: type goal in plain English → LLM extracts fields
 *  2. Manual: pick domain + known skills + target skill from UI
 * On submit, stores the profile and navigates to /dashboard
 */
export default function Onboarding({ onProfileSet }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("chat"); // "chat" | "manual"

  // ── Chat intake state ────────────────────────────────
  const [chatMsg, setChatMsg] = useState("");
  const [chatResult, setChatResult] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  // ── Manual state ─────────────────────────────────────
  const [domain, setDomain] = useState(DOMAINS[0]);
  const [skills, setSkills] = useState([]); // full skill list for domain
  const [knownSkills, setKnownSkills] = useState([]); // selected known skill ids
  const [goalSkill, setGoalSkill] = useState("");
  const [timePerWeek, setTimePerWeek] = useState(10);
  const [userName, setUserName] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  // Load skills when domain changes (manual tab)
  useEffect(() => {
    if (tab !== "manual") return;
    setSkills([]);
    setKnownSkills([]);
    setGoalSkill("");
    api
      .getSkills(domain)
      .then((data) => {
        setSkills(data);
        if (data.length > 0) setGoalSkill(data[data.length - 1].id);
      })
      .catch(() => {});
  }, [domain, tab]);

  // ── Chat intake flow ─────────────────────────────────
  async function handleChatSubmit(e) {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    setChatLoading(true);
    setChatError(null);
    setChatResult(null);
    try {
      const res = await api.chatIntake(chatMsg.trim());
      setChatResult(res);
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleChatConfirm() {
    if (!chatResult?.domain || !chatResult?.goal_skill_id) return;
    setChatLoading(true);
    try {
      const profile = await api.createProfile({
        name: userName || "Learner",
        domain: chatResult.domain,
        known_skills: chatResult.known_skills || [],
        goal_skill_id: chatResult.goal_skill_id,
        time_per_week_hours: chatResult.time_per_week_hours || 10,
      });
      onProfileSet(profile, chatResult);
      navigate("/dashboard");
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Manual flow ──────────────────────────────────────
  function toggleKnown(id) {
    setKnownSkills((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!goalSkill) return;
    setManualLoading(true);
    try {
      const profile = await api.createProfile({
        name: userName || "Learner",
        domain,
        known_skills: knownSkills,
        goal_skill_id: goalSkill,
        time_per_week_hours: timePerWeek,
      });
      onProfileSet(profile, { domain, known_skills: knownSkills, goal_skill_id: goalSkill });
      navigate("/dashboard");
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div className="page">
      <Navbar />
      <div
        className="container"
        style={{ maxWidth: 680, padding: "60px 24px" }}
      >
        <div className="animate-fade-up">
          <div className="badge badge-accent" style={{ marginBottom: 16 }}>
            Step 1 of 1
          </div>
          <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", marginBottom: 12 }}>
            What's your learning goal?
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 36 }}>
            Describe your goal in plain English, or pick your details manually.
          </p>

          {/* Name input */}
          <div className="form-group" style={{ marginBottom: 28 }}>
            <label className="form-label">Your name (optional)</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Sabarish"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 32 }}>
            <button
              className={`tab ${tab === "chat" ? "active" : ""}`}
              id="tab-chat"
              onClick={() => setTab("chat")}
            >
              ✨ Chat Intake
            </button>
            <button
              className={`tab ${tab === "manual" ? "active" : ""}`}
              id="tab-manual"
              onClick={() => setTab("manual")}
            >
              ⚙️ Manual Setup
            </button>
          </div>

          {/* ── CHAT TAB ── */}
          {tab === "chat" && (
            <div className="animate-fade-in">
              <form onSubmit={handleChatSubmit}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Describe your goal</label>
                  <textarea
                    className="textarea"
                    placeholder={`e.g. "I know Python basics and SQL. I want to become a machine learning engineer in 3 months and can study 10 hours a week."`}
                    value={chatMsg}
                    onChange={(e) => setChatMsg(e.target.value)}
                    rows={4}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={chatLoading || !chatMsg.trim()}
                  style={{ width: "100%" }}
                  id="btn-analyze"
                >
                  {chatLoading ? (
                    <>
                      <div className="spinner" /> Analyzing...
                    </>
                  ) : (
                    "✨ Analyze My Goal"
                  )}
                </button>
              </form>

              {chatError && (
                <div className="alert alert-error" style={{ marginTop: 20 }}>
                  ⚠️ {chatError}
                </div>
              )}

              {chatResult && (
                <div
                  className="card card-glow animate-fade-up"
                  style={{ marginTop: 24 }}
                >
                  <div style={{ marginBottom: 16 }}>
                    <div className="badge badge-accent" style={{ marginBottom: 12 }}>
                      ✅ Extracted profile
                    </div>

                    {chatResult.warning && (
                      <div
                        className="alert alert-warning"
                        style={{ marginBottom: 16 }}
                      >
                        ⚠️ {chatResult.warning}
                      </div>
                    )}

                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.9rem",
                      }}
                    >
                      <tbody>
                        {[
                          ["Domain", chatResult.domain || "—"],
                          ["Target Skill", chatResult.goal_skill_name || "—"],
                          [
                            "Known Skills",
                            chatResult.known_skills?.join(", ") || "None",
                          ],
                          [
                            "Time / week",
                            chatResult.time_per_week_hours
                              ? `${chatResult.time_per_week_hours} hours`
                              : "—",
                          ],
                        ].map(([k, v]) => (
                          <tr key={k}>
                            <td
                              style={{
                                padding: "8px 0",
                                color: "var(--text-secondary)",
                                width: "40%",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              {k}
                            </td>
                            <td
                              style={{
                                padding: "8px 0",
                                color: "var(--text-primary)",
                                fontWeight: 500,
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              {v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {chatResult.raw_llm_reasoning && (
                    <details style={{ marginBottom: 16 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          fontSize: "0.85rem",
                        }}
                      >
                        View LLM reasoning
                      </summary>
                      <pre
                        style={{
                          marginTop: 8,
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: 8,
                          padding: 12,
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {chatResult.raw_llm_reasoning}
                      </pre>
                    </details>
                  )}

                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={handleChatConfirm}
                    disabled={
                      chatLoading ||
                      !chatResult.domain ||
                      !chatResult.goal_skill_id
                    }
                    id="btn-confirm-chat"
                  >
                    {chatLoading ? (
                      <><div className="spinner" /> Building path...</>
                    ) : (
                      "🗺️ Build My Learning Path →"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── MANUAL TAB ── */}
          {tab === "manual" && (
            <form
              className="animate-fade-in"
              onSubmit={handleManualSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 24 }}
            >
              {/* Domain */}
              <div className="form-group">
                <label className="form-label">Learning Domain</label>
                <select
                  className="select"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  id="select-domain"
                >
                  {DOMAINS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Target skill */}
              <div className="form-group">
                <label className="form-label">Target Skill (Goal)</label>
                <select
                  className="select"
                  value={goalSkill}
                  onChange={(e) => setGoalSkill(e.target.value)}
                  id="select-goal"
                >
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Known skills */}
              <div className="form-group">
                <label className="form-label">
                  Skills you already know (click to toggle)
                </label>
                {skills.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                    Loading skills...
                  </p>
                ) : (
                  <div className="skill-chips">
                    {skills.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`skill-chip ${
                          knownSkills.includes(s.id) ? "selected" : ""
                        }`}
                        onClick={() => toggleKnown(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Time per week */}
              <div className="form-group">
                <label className="form-label">
                  Hours available per week:{" "}
                  <span style={{ color: "var(--accent)" }}>{timePerWeek}h</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={40}
                  value={timePerWeek}
                  onChange={(e) => setTimePerWeek(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={manualLoading || !goalSkill}
                style={{ width: "100%" }}
                id="btn-manual-submit"
              >
                {manualLoading ? (
                  <><div className="spinner" /> Building path...</>
                ) : (
                  "🗺️ Build My Learning Path →"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
