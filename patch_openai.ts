import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  /baseURL: process\.env\.GROQ_BASE_URL \|\| "https:\/\/api\.groq\.com\/openai\/v1",/,
  'baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",\n  compatibility: "compatible",'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
