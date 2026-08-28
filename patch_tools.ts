import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  /tools: \{[\s\S]*?\n  \},/g,
  'tools: {},'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
