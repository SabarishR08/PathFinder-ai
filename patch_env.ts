import fs from 'fs';
let code = fs.readFileSync('.env', 'utf8');
code = code.replace(/GROQ_MODEL=.*/, 'GROQ_MODEL=llama3-70b-8192');
fs.writeFileSync('.env', code);
