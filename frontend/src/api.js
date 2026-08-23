/**
 * PathFinder API client
 * All backend calls go through here. BASE_URL points to the FastAPI server.
 */

// In dev, Vite proxies /api/* to http://localhost:8000 (see vite.config.js).
// In production, set VITE_API_URL to your deployed backend URL.
const BASE_URL = import.meta.env.VITE_API_URL || "";

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request("GET", "/health"),
  getDomains: () => request("GET", "/api/domains"),
  getSkills: (domain) =>
    request("GET", `/api/skills/${encodeURIComponent(domain)}`),
  chatIntake: (message) => request("POST", "/api/chat-intake", { message }),
  createProfile: (data) => request("POST", "/api/profile", data),
  getPath: (data) => request("POST", "/api/path", data),
  getFreeResourcesForPath: (data, format) =>
    request("POST", `/api/resources/for-path${format ? `?resource_format=${encodeURIComponent(format)}` : ""}`, data),
  getOptimalPath: (data) => request("POST", "/api/path/optimal", data),
  explain: (data) => request("POST", "/api/explain", data),
  updateProgress: (userId, completedSkillIds) =>
    request("POST", "/api/progress", {
      user_id: userId,
      completed_skill_ids: completedSkillIds,
    }),
};
