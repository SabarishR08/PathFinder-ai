import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  'import { createOpenAI } from "@ai-sdk/openai";',
  'import { createGroq } from "@ai-sdk/groq";'
);

code = code.replace(
  /const openaiProvider = createOpenAI\(\{\s*apiKey: process\.env\.GROQ_API_KEY \|\| process\.env\.OPENAI_API_KEY,\s*baseURL: process\.env\.GROQ_BASE_URL \|\| "https:\/\/api\.groq\.com\/openai\/v1",\s*compatibility: "compatible",\s*\}\);/,
  `const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});`
);

code = code.replace(
  /model: openaiProvider\(process\.env\.GROQ_MODEL \|\| "openai\/gpt-oss-120b"\),/,
  'model: groqProvider(process.env.GROQ_MODEL || "llama3-70b-8192"),'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
