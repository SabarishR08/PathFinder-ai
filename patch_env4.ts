import fs from 'fs';
let code = fs.readFileSync('.env', 'utf8');
code = code.replace(/GROQ_MODEL=.*/, 'GROQ_MODEL=openai/gpt-oss-120b');
fs.writeFileSync('.env', code);
