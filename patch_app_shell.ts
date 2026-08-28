import fs from 'fs';
let code = fs.readFileSync('src/components/app/AppShell.tsx', 'utf8');

code = code.replace(
  /<header className="sticky top-0 z-40 border-b border-border\/70 bg-background\/80 backdrop-blur-md">/,
  '<header className="sticky top-0 z-40 border-b border-white/5 bg-black/60 backdrop-blur-xl">'
);

code = code.replace(
  /<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary\/15 border border-primary\/30">/,
  '<span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-white/5">'
);

code = code.replace(
  /<span className="font-semibold tracking-tight">\s*PathFinder<span className="text-primary"> AI<\/span>\s*<\/span>/,
  '<span className="font-semibold tracking-tight text-primary">PathFinder</span>'
);

code = code.replace(
  /active \? "bg-primary\/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"/,
  'active ? "bg-primary/10 text-primary border border-white/5" : "text-muted-foreground hover:text-primary hover:bg-white/5 border border-transparent"'
);

code = code.replace(
  /bg-primary\/15/,
  'bg-primary/10'
);

code = code.replace(
  /border-border\/70/,
  'border-white/5 bg-black/40'
);

code = code.replace(
  /<span>PathFinder AI — evidence-based adaptive learning paths<\/span>\s*<span>\s*\{typeof window !== "undefined" \? new Date\(\)\.getFullYear\(\) : ""\} · deterministic engine · real course data\s*<\/span>/,
  '<span>PathFinder — built for the AI hackathon</span>\n          <div className="flex gap-4">\n            <span className="hover:text-primary transition-colors cursor-default">Experimental Build</span>\n            <span className="hover:text-primary transition-colors cursor-default">Nexus Engine</span>\n          </div>'
);

fs.writeFileSync('src/components/app/AppShell.tsx', code);
