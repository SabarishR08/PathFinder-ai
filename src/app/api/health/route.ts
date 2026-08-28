import { db } from "@/lib/db";
import { loadEngineData } from "@/lib/engine/data";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let llmProviders: string[] = [];
  try {
    await db.learner.count();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  if (process.env.GROQ_API_KEY) llmProviders.push("groq");
  if (process.env.OPENAI_API_KEY) llmProviders.push("openai-compatible");
  if (process.env.NVIDIA_API_KEY) llmProviders.push("nvidia");

  let catalogue = { courses: 0, skills: 0, resources: 0 };
  try {
    const { graph, catalogue: cat, resources } = await loadEngineData();
    catalogue = { courses: cat.courses.length, skills: Object.keys(graph.skills).length, resources: resources.resources.length };
  } catch {
    /* data not loadable */
  }

  // Check Render ML backend
  let mlBackend = "unavailable";
  try {
    const renderUrl = process.env.RENDER_BACKEND_URL || "https://pathfinder-backend-yagz.onrender.com";
    const res = await fetch(`${renderUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) mlBackend = "connected";
  } catch {
    mlBackend = "unavailable";
  }

  return json({
    status: "ok",
    service: "PathFinder AI",
    time: new Date().toISOString(),
    db: dbOk ? "connected" : "unavailable",
    llm: llmProviders.length ? llmProviders : "zai-sdk-or-fallback",
    ml_backend: mlBackend,
    catalogue,
  });
}
