import { db } from "@/lib/db";
import { apiError, sseStream, readJson } from "@/lib/api-helpers";
import { runAgentTurn, persistAgentTurn, AGENT_SEPARATOR, type AgentPhase } from "@/lib/onboarding/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface MessageBody {
  learnerId: string;
  message: string;
}

/**
 * Streaming interview turn. Emits:
 *   { type: "delta", text }        — reply tokens (client hides the JSON tail)
 *   { type: "done", reply, extracted, phase } — final state after persistence
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<MessageBody>(request);
    if (!body.learnerId || !body.message?.trim()) {
      return apiError("learnerId and message are required");
    }

    const learner = await db.learner.findUnique({ where: { id: body.learnerId } });
    if (!learner) return apiError("Learner not found", 404);

    const generator = (async function* () {
      const turn = await runAgentTurn(body.learnerId, body.message.trim());
      // Stream the conversational part, token-safely: cut at the separator.
      let sent = 0;
      const sepIdx = turn.raw.indexOf(AGENT_SEPARATOR);
      const visible = sepIdx >= 0 ? turn.raw.slice(0, sepIdx) : turn.raw;
      // Chunk into small deltas so the UI animates naturally.
      const CHUNK = 24;
      for (let i = 0; i < visible.length; i += CHUNK) {
        yield { type: "delta", text: visible.slice(i, i + CHUNK) };
      }
      if (!visible.trim()) {
        yield { type: "delta", text: "…" };
      }

      const persisted = await persistAgentTurn(body.learnerId, body.message.trim(), turn);
      yield {
        type: "done",
        reply: visible.trim(),
        extracted: persisted.extracted,
        phase: persisted.phase as AgentPhase,
        provider: turn.provider,
      };
    })();

    return sseStream(generator);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Interview turn failed", 500);
  }
}
