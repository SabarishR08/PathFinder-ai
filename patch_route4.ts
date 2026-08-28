import fs from 'fs';
let code = fs.readFileSync('src/app/api/onboarding/message/route.ts', 'utf8');

code = code.replace(
  `        if (part.type === "text-delta") {
          replyBuffer += part.textDelta;
          yield { type: "delta", text: part.textDelta };
        } else if (part.type === "tool-call") {`,
  `        if (part.type === "text-delta") {
          if (!phaseComplete) {
            replyBuffer += part.textDelta;
            yield { type: "delta", text: part.textDelta };
          }
        } else if (part.type === "tool-call") {`
);

fs.writeFileSync('src/app/api/onboarding/message/route.ts', code);
