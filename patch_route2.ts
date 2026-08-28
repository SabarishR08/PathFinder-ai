import fs from 'fs';
let code = fs.readFileSync('src/app/api/onboarding/message/route.ts', 'utf8');

const newLoop = `      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          replyBuffer += part.textDelta;
          yield { type: "delta", text: part.textDelta };
        } else if (part.type === "tool-call") {
          if (part.toolName === "markPhaseComplete") {
            phaseComplete = true;
            extracted = part.args;
            extracted.phaseComplete = true;
            
            const msg = "\\n\\nI think we have enough info. Do you have anything to add, or is this enough?";
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
      }`;

code = code.replace(/      for await \(const part of result\.fullStream\) \{[\s\S]*?      \}/, newLoop);

fs.writeFileSync('src/app/api/onboarding/message/route.ts', code);
