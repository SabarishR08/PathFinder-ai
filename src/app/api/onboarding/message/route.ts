import { db } from "@/lib/db";
import { apiError, sseStream, readJson } from "@/lib/api-helpers";
import { runAgentStream, persistAgentTurn, type AgentPhase, type ExtractedProfile, PHASE_ORDER } from "@/lib/onboarding/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface MessageBody {
  learnerId: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<MessageBody>(request);
    if (!body.learnerId || !body.message?.trim()) {
      return apiError("learnerId and message are required");
    }


    const learner = await db.learner.findUnique({ where: { id: body.learnerId } });
    if (!learner) return apiError("Learner not found", 404);

    const wantsSkip = /skip|next question|move on|let'?s move/i.test(body.message.trim());
    if (wantsSkip) {
      const currentState = await db.agentState.findUnique({ where: { learnerId: body.learnerId } });
      if (currentState && currentState.phase !== "done") {
        const idx = PHASE_ORDER.indexOf(currentState.phase as AgentPhase);
        const nextPhase = PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)];
        await db.agentState.update({
          where: { learnerId: body.learnerId },
          data: { phase: nextPhase }
        });
      }
    }

    const generator = (async function* () {
      const { fullReply: apiReply } = await runAgentStream(body.learnerId, body.message.trim());
      
      const replyBuffer = apiReply || "";
      let phaseComplete = false;
      let extracted: ExtractedProfile = {};

      if (replyBuffer) {
        yield { type: "delta", text: replyBuffer };
      } else {
        yield { type: "delta", text: "…" };
      }

      const wantsSkip = /skip|next question|move on|let'?s move/i.test(body.message.trim());
      if (wantsSkip) {
        phaseComplete = true;
      }

      const persisted = await persistAgentTurn(
        body.learnerId,
        body.message.trim(),
        replyBuffer.trim(),
        extracted,
        wantsSkip
      );

      yield {
        type: "done",
        reply: replyBuffer.trim(),
        extracted: persisted.extracted,
        phase: persisted.phase as AgentPhase,
        waitingForConfirmation: phaseComplete && !wantsSkip, // Ask confirmation unless they explicitly skipped
      };
    })();

    return sseStream(generator);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Interview turn failed", 500);
  }
}
