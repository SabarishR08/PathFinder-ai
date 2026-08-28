import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  'system: systemPrompt,',
  'system: systemPrompt + "\\n\\nCRITICAL INSTRUCTION: You MUST call the markPhaseComplete tool immediately with empty arguments.",'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
