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
      const { result, state } = await runAgentStream(body.learnerId, body.message.trim());
      
      let replyBuffer = "";
      let phaseComplete = false;
      let extracted: ExtractedProfile = {};

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          if (!phaseComplete) {
            replyBuffer += part.text || "";
            yield { type: "delta", text: part.text || "" };
          }
        } else if (part.type === "tool-call") {
          if (part.toolName === "markPhaseComplete") {
            phaseComplete = true;
            extracted = (typeof part.args === 'object' && part.args !== null) ? { ...part.args } as any : {};
            extracted.phaseComplete = true;
            
            const msg = "\n\nI think we have enough info. Do you have anything to add, or is this enough?";
            replyBuffer += msg;
            yield { type: "delta", text: msg };
          } else {
            yield { type: "tool-call", toolName: part.toolName, args: part.args };
          }
        } else if (part.type === "tool-result") {
          if (part.toolName !== "markPhaseComplete") {
            yield { type: "tool-result", toolName: part.toolName, result: part.result };
          }
        }
      }

      if (!replyBuffer.trim()) {
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
