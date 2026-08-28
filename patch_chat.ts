import fs from 'fs';
let code = fs.readFileSync('src/app/onboarding/page.tsx', 'utf8');

code = code.replace(
  `turn.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary rounded-bl-md"`,
  `turn.role === "user" ? "bg-[#3A3A3C] text-white rounded-br-md" : "bg-[#1C1C1E] text-white rounded-bl-md border border-white/5"`
);
code = code.replace(
  `                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">`,
  `                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#1C1C1E] border border-white/5 text-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">`
);

fs.writeFileSync('src/app/onboarding/page.tsx', code);
