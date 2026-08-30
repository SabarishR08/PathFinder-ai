/**
 * Startup environment validation.
 *
 * Call `validateEnv()` once on first request (or at module load in server components)
 * to surface missing or misconfigured variables early. Returns a snapshot that
 * callers can inspect or log.
 */

export interface EnvStatus {
  ok: boolean;
  warnings: string[];
  errors: string[];
  providers: string[];
  gatewayEnabled: boolean;
}

let cached: EnvStatus | null = null;

/** Reset cache — use in tests only. */
export function resetEnvCache(): void {
  cached = null;
}

export function validateEnv(): EnvStatus {
  if (cached) return cached;

  const warnings: string[] = [];
  const errors: string[] = [];
  const providers: string[] = [];

  // ── Required ──────────────────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is not set — Prisma will fail to connect");
  }

  // ── LLM providers (at least one required) ────────────────────────────
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  if (gatewayKey) {
    providers.push("vercel-gateway");
  }
  if (groqKey) {
    providers.push("groq");
  }
  if (openaiKey) {
    providers.push("openai-compatible");
  }
  if (nvidiaKey) {
    providers.push("nvidia");
  }

  if (providers.length === 0) {
    errors.push(
      "No LLM provider configured — set AI_GATEWAY_API_KEY (recommended), GROQ_API_KEY, OPENAI_API_KEY, or NVIDIA_API_KEY",
    );
  }

  // ── Gateway-specific checks ──────────────────────────────────────────
  if (gatewayKey && groqKey) {
    warnings.push(
      "Both AI_GATEWAY_API_KEY and GROQ_API_KEY are set — gateway takes priority, direct Groq is skipped",
    );
  }

  // ── Optional but recommended ─────────────────────────────────────────
  if (!process.env.GITHUB_TOKEN) {
    warnings.push(
      "GITHUB_TOKEN not set — GitHub evidence collection limited to 60 requests/hour",
    );
  }

  // ── pgbouncer sanity check ───────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.includes(":6543/") && !dbUrl.includes("pgbouncer=true")) {
    warnings.push(
      "DATABASE_URL uses Supabase pooler (port 6543) without ?pgbouncer=true — may cause 'prepared statement does not exist' errors",
    );
  }

  cached = {
    ok: errors.length === 0,
    warnings,
    errors,
    providers,
    gatewayEnabled: !!gatewayKey,
  };

  // Log on first call
  if (errors.length > 0) {
    console.error("[env-check] ERRORS:");
    errors.forEach((e) => console.error(`  ✗ ${e}`));
  }
  if (warnings.length > 0) {
    console.warn("[env-check] WARNINGS:");
    warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }
  if (providers.length > 0) {
    console.log(`[env-check] LLM providers: ${providers.join(", ")}`);
  }
  if (gatewayKey) {
    const model = process.env.AI_GATEWAY_MODEL || "groq/llama-3.3-70b-versatile";
    console.log(`[env-check] Vercel AI Gateway enabled → ${model}`);
  }

  return cached;
}

/**
 * Returns a safe summary for the health endpoint (no secrets).
 */
export function envSummary(): {
  database: "configured" | "missing";
  llmProviders: string[];
  gateway: boolean;
  github: boolean;
} {
  const status = validateEnv();
  return {
    database: process.env.DATABASE_URL ? "configured" : "missing",
    llmProviders: status.providers,
    gateway: status.gatewayEnabled,
    github: !!process.env.GITHUB_TOKEN,
  };
}
