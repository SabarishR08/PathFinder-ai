import { proxyGetToRender } from "@/lib/ml-proxy";
import { loadEngineData } from "@/lib/engine/data";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/ml/model-stats
 *
 * ML model metadata for the hackathon judges panel.
 * Combines data from the Next.js engine + the Python ML backend on Render.
 */
export async function GET() {
  // Fetch ML model stats from Render
  const renderResult = await proxyGetToRender("/api/model-stats");

  // Load Next.js engine stats
  let engineStats = {
    path_engine: {
      type: "Deterministic Graph Algorithm",
      algorithm: "Kahn's algorithm + min-heap (SPT scheduling)",
      course_matching: "Character n-gram TF-IDF + cosine similarity",
      skill_coverage: "100%",
      courses: 0,
      skills: 0,
      domains: 0,
    },
  };

  try {
    const { graph, catalogue, resources } = await loadEngineData();
    const allSkills = Object.values(graph.skills).flat();
    const domains = [...new Set(allSkills.map((s) => s.domain))];
    engineStats.path_engine = {
      ...engineStats.path_engine,
      courses: catalogue.courses.length,
      skills: allSkills.length,
      domains: domains.length,
    };
  } catch {
    /* data not loadable */
  }

  if (!renderResult.ok) {
    // Render is down — return just the engine stats
    return json({
      risk_model: { error: "Render backend unavailable" },
      embedding_model: { error: "Render backend unavailable" },
      pipeline: engineStats,
    });
  }

  const renderData = renderResult.data as Record<string, unknown>;

  return json({
    ...renderData,
    pipeline: engineStats,
  });
}
