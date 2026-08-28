import fs from 'fs';
let code = fs.readFileSync('src/app/api/onboarding/message/route.ts', 'utf8');

code = code.replace(
  /replyBuffer \+= part\.textDelta \|\| "";\n            console\.log\("DEBUG PART:", part\);\n            yield \{ type: "delta", text: part\.textDelta \};/g,
  `replyBuffer += part.text || "";\n            yield { type: "delta", text: part.text || "" };`
);

fs.writeFileSync('src/app/api/onboarding/message/route.ts', code);
