import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  'import { createGroq } from "@ai-sdk/groq";',
  'import { createOpenAI } from "@ai-sdk/openai";'
);

code = code.replace(
  `const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});`,
  `const openaiProvider = createOpenAI({
  apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
});`
);

code = code.replace(
  /model: groqProvider\(process\.env\.GROQ_MODEL \|\| "llama3-70b-8192"\),/,
  'model: openaiProvider(process.env.GROQ_MODEL || "openai/gpt-oss-120b"),'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
