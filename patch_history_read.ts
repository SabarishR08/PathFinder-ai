import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  /...history.slice\(-10\)\.map\(\(t\) => \(\{ role: t\.role, content: t\.content \}\)\),/,
  '...history.slice(-10).map((t) => ({ role: t.role, content: t.content || "..." })),'
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
