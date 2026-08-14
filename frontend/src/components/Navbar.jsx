import { Link, useLocation } from "react-router-dom";

export default function Navbar({ progress }) {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <div className="logo-icon">🧭</div>
        PathFinder<span className="text-accent"> AI</span>
      </Link>

      {isDashboard && progress !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Overall progress
          </span>
          <div style={{ width: 120 }}>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            {progress}%
          </span>
        </div>
      )}

      {!isDashboard && (
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/onboarding" className="btn btn-primary btn-sm">
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
