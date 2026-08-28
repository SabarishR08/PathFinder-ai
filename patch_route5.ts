import fs from 'fs';
let code = fs.readFileSync('src/app/api/onboarding/message/route.ts', 'utf8');

code = code.replace(
  `replyBuffer += part.textDelta;`,
  `replyBuffer += part.textDelta || "";\n            console.log("DEBUG PART:", part);`
);

fs.writeFileSync('src/app/api/onboarding/message/route.ts', code);
