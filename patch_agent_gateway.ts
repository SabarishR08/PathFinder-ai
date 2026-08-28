import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  /model: groqProvider\(process\.env\.GROQ_MODEL \|\| "openai\/gpt-oss-120b"\),/,
  `model: (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_ENV) ? gateway.languageModel("groq/llama-3.1-70b-versatile") : groqProvider("llama-3.1-70b-versatile"),`
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
