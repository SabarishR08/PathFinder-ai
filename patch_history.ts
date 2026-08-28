import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  'history.push({ role: "assistant", content: replyText.slice(0, 2000) });',
  'history.push({ role: "assistant", content: replyText.slice(0, 2000) || "..." });'
);

code = code.replace(
  'baseURL: process.env.GROQ_BASE_URL || "https://gateway.vercel.ai/v1/groq",',
  'baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
