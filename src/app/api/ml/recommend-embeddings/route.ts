import { proxyToRender } from "@/lib/ml-proxy";
import { json, apiError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/ml/recommend-embeddings
 *
 * Recommend courses using sentence-transformer embeddings + cosine similarity.
 * Proxies the request to the Python backend on Render.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await proxyToRender("/api/recommend-embeddings", body);

    if (!result.ok) {
      return apiError(result.error || "ML backend error", result.status);
    }

    return json(result.data);
  } catch {
    return apiError("Invalid request body", 400);
  }
}
