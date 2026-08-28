import { proxyToRender } from "@/lib/ml-proxy";
import { json, apiError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/ml/shap-explain
 *
 * SHAP TreeExplainer — returns per-feature contribution values showing
 * exactly how each feature pushes the prediction toward pass or fail.
 * Proxies the request to the Python backend on Render.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await proxyToRender("/api/shap-explain", body);

    if (!result.ok) {
      return apiError(result.error || "ML backend error", result.status);
    }

    return json(result.data);
  } catch {
    return apiError("Invalid request body", 400);
  }
}
