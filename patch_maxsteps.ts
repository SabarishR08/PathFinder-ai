import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  'stopWhen: stepCountIs(3),',
  'maxSteps: 3,'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
