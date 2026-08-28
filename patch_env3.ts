import fs from 'fs';
let code = fs.readFileSync('.env', 'utf8');
code = code.replace(/GROQ_MODEL=.*/, 'GROQ_MODEL=llama-3.1-70b-versatile');
fs.writeFileSync('.env', code);
