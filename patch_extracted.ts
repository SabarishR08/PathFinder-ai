import fs from 'fs';
let code = fs.readFileSync('src/app/api/onboarding/message/route.ts', 'utf8');

code = code.replace(
  /extracted = part\.args;\n\s*extracted\.phaseComplete = true;/g,
  `extracted = (part.args as any) || {};\n            extracted.phaseComplete = true;`
);

fs.writeFileSync('src/app/api/onboarding/message/route.ts', code);
