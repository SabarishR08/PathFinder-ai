/**
 * Proxy requests to the Python ML backend on Render.
 *
 * The 3 ML endpoints (risk-score, shap-explain, recommend-embeddings) use
 * native Python libraries (LightGBM, SHAP, sentence-transformers) with no
 * JavaScript equivalent, so they run on Render and Next.js proxies to them.
 *
 * Set RENDER_BACKEND_URL in your Vercel environment:
 *   e.g. https://pathfinder-backend-yagz.onrender.com
 */

const RENDER_URL = process.env.RENDER_BACKEND_URL || "https://pathfinder-backend-yagz.onrender.com";
const TIMEOUT_MS = 30_000;

export interface ProxyResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

/**
 * Proxy a POST request to the Render ML backend.
 */
export async function proxyToRender(
  path: string,
  body: unknown,
): Promise<ProxyResult> {
  const url = `${RENDER_URL}${path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text || `Render returned ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `Render backend unreachable: ${msg}` };
  }
}

/**
 * Proxy a GET request to the Render ML backend.
 */
export async function proxyGetToRender(path: string): Promise<ProxyResult> {
  const url = `${RENDER_URL}${path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text || `Render returned ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `Render backend unreachable: ${msg}` };
  }
}
