import fs from 'fs';
let code = fs.readFileSync('src/app/globals.css', 'utf8');

const darkTheme = `.dark {
  --radius: 0.625rem;
  --background: oklch(0.1 0 0); /* Black / #000000 */
  --foreground: oklch(0.98 0 0); /* Pure White */
  --card: oklch(0.18 0 0); /* Dark grey */
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.15 0 0);
  --popover-foreground: oklch(0.98 0 0);
  --primary: oklch(0.95 0 0); /* Silver/White */
  --primary-foreground: oklch(0.1 0 0); /* Black text on primary */
  --secondary: oklch(0.2 0 0); /* Blurred grey */
  --secondary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.65 0 0); /* Silver text */
  --accent: oklch(0.25 0 0);
  --accent-foreground: oklch(0.98 0 0);
  --destructive: oklch(0.62 0.19 25);
  --destructive-foreground: oklch(0.97 0.005 25);
  --border: oklch(0.25 0 0); /* Subtle silver border */
  --input: oklch(0.2 0 0);
  --ring: oklch(0.95 0 0);
  --chart-1: oklch(0.72 0.14 162);
  --chart-2: oklch(0.78 0.13 80);
  --chart-3: oklch(0.65 0.12 230);
  --chart-4: oklch(0.66 0.16 305);
  --chart-5: oklch(0.62 0.19 25);
  --sidebar: oklch(0.16 0.014 165);
  --sidebar-foreground: oklch(0.95 0.005 165);
  --sidebar-primary: oklch(0.72 0.14 162);
  --sidebar-primary-foreground: oklch(0.15 0.02 165);
  --sidebar-accent: oklch(0.22 0.016 165);
  --sidebar-accent-foreground: oklch(0.9 0.005 165);
  --sidebar-border: oklch(0.26 0.015 165);
  --sidebar-ring: oklch(0.72 0.14 162);
}`;

code = code.replace(/\.dark \{[\s\S]*?\n\}/, darkTheme);

const customClasses = `/* PathFinder custom surface treatments */
.glass-card {
  background: color-mix(in oklch, var(--card) 60%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid color-mix(in oklch, var(--foreground) 10%, transparent);
  border-left: 1px solid color-mix(in oklch, var(--foreground) 5%, transparent);
  border-right: 1px solid color-mix(in oklch, var(--foreground) 5%, transparent);
  border-bottom: 1px solid color-mix(in oklch, var(--foreground) 2%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in oklch, var(--foreground) 10%, transparent);
  border-radius: 24px;
}

.glow-primary {
  box-shadow: 0 0 40px -12px oklch(0.95 0 0 / 0.45);
}

.glow-button {
  box-shadow: 0 4px 15px color-mix(in oklch, var(--foreground) 10%, transparent), inset 0 1px 0 color-mix(in oklch, var(--foreground) 80%, transparent);
}

.text-gradient {
  background: linear-gradient(135deg, #ffffff 0%, #a0a0a5 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}`;

code = code.replace(/\/\* PathFinder custom surface treatments \*\/[\s\S]*?(?=\.stream-caret::after)/, customClasses + '\n\n');

fs.writeFileSync('src/app/globals.css', code);
