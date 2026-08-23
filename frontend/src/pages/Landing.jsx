import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const FEATURES = [
  {
    title: "AI-Powered Intake",
    desc: "Just describe your goal in plain English. Our LLM extracts your domain, known skills, and target — no forms needed.",
  },
  {
    title: "Prerequisite-Aware Paths",
    desc: "Built on a real skill graph with topological ordering, so every milestone has the right foundations first.",
  },
  {
    title: "Real Course Recommendations",
    desc: "979 actual Coursera & Udacity courses, semantically matched to skills — not placeholders.",
  },
  {
    title: "Progress Tracking",
    desc: "Mark skills complete, watch your path shrink in real time, and stay motivated with live progress %.",
  },
];

const DOMAINS = [
  { name: "Data Science", color: "#3b82f6", skills: 25 },
  { name: "Web Development", color: "#8b5cf6", skills: 25 },
  { name: "Cybersecurity", color: "#ef4444", skills: 21 },
];

export default function Landing() {
  return (
    <div className="page">
      <Navbar />

      {/* Hero */}
      <section
        style={{
          padding: "100px 24px 80px",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Glow orb */}
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 300,
            background:
              "radial-gradient(ellipse, rgba(0,212,170,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div className="container" style={{ position: "relative" }}>
          <div
            className="badge badge-accent animate-fade-up"
            style={{ marginBottom: 24, display: "inline-flex" }}
          >
            Personalized learning paths
          </div>

          <h1 className="animate-fade-up" style={{ animationDelay: "0.1s", marginBottom: 24 }}>
            Your personalized road to{" "}
            <span
              style={{
                background: "linear-gradient(135deg, var(--accent), #3b82f6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              mastery
            </span>
          </h1>

          <p
            className="animate-fade-up"
            style={{
              animationDelay: "0.2s",
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
              maxWidth: 600,
              margin: "0 auto 48px",
              lineHeight: 1.7,
            }}
          >
            Tell us your goal. PathFinder builds a step-by-step skill path with
            real courses, skipping what you already know.
          </p>

          <div
            className="animate-fade-up"
            style={{
              animationDelay: "0.3s",
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link to="/onboarding" className="btn btn-primary btn-lg">
              Start my path
            </Link>
            <a
              href="#how-it-works"
              className="btn btn-secondary btn-lg"
            >
              How it works
            </a>
          </div>

          {/* Stats row */}
          <div
            className="animate-fade-up"
            style={{
              animationDelay: "0.45s",
              display: "flex",
              justifyContent: "center",
              gap: 48,
              marginTop: 64,
              flexWrap: "wrap",
            }}
          >
            {[
              { val: "979", label: "Real courses" },
              { val: "106", label: "Mapped skills" },
              { val: "3", label: "Domains" },
              { val: "100%", label: "Coverage" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    fontFamily: "Space Grotesk, sans-serif",
                    color: "var(--accent)",
                  }}
                >
                  {s.val}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domains */}
      <section style={{ padding: "60px 24px" }}>
        <div className="container">
          <h2
            style={{
              textAlign: "center",
              marginBottom: 40,
              color: "var(--text-primary)",
            }}
          >
            Choose your domain
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {DOMAINS.map((d) => (
              <Link
                key={d.name}
                to="/onboarding"
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{
                    cursor: "pointer",
                    textAlign: "center",
                    padding: 36,
                  }}
                >
                  <h3 style={{ marginBottom: 8, color: "var(--text-primary)" }}>
                    {d.name}
                  </h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    {d.skills} skills mapped
                  </p>
                  <div
                    style={{
                      marginTop: 16,
                      height: 3,
                      borderRadius: 999,
                      background: d.color,
                      opacity: 0.6,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" style={{ padding: "60px 24px 80px" }}>
        <div className="container">
          <h2 style={{ textAlign: "center", marginBottom: 48 }}>
            How it works
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
            className="stagger"
          >
            {FEATURES.map((f, i) => (
              <div key={i} className="card animate-fade-up">
                <div className="badge badge-accent" style={{ marginBottom: 16 }}>0{i + 1}</div>
                <h3 style={{ marginBottom: 10, color: "var(--text-primary)" }}>
                  {f.title}
                </h3>
                <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section
        style={{
          padding: "60px 24px",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <div className="container">
          <h2 style={{ marginBottom: 16 }}>Ready to find your path?</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
            It takes 30 seconds to describe your goal.
          </p>
          <Link to="/onboarding" className="btn btn-primary btn-lg">
            Get started
          </Link>
        </div>
      </section>
    </div>
  );
}
