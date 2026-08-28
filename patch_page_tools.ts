import fs from 'fs';
let code = fs.readFileSync('src/app/onboarding/page.tsx', 'utf8');

// Add activeTools state
code = code.replace(
  'const [streamText, setStreamText] = useState("");',
  'const [streamText, setStreamText] = useState("");\n  const [activeTools, setActiveTools] = useState<string[]>([]);'
);

// Update streamOnboardingMessage call
code = code.replace(
  `      const final = await streamOnboardingMessage(learnerId, message, (delta) => {
        setStreamText((t) => t + delta);
      });`,
  `      const final = await streamOnboardingMessage(
        learnerId, 
        message, 
        (delta) => setStreamText((t) => t + delta),
        (tool) => setActiveTools((prev) => [...prev, tool]),
        (tool) => setActiveTools((prev) => prev.filter(t => t !== tool))
      );`
);

// Clear tools when done
code = code.replace(
  'setStreamText("");',
  'setStreamText("");\n      setActiveTools([]);'
);

// Add render for activeTools
code = code.replace(
  `              {streaming && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                    {streamText || <span className="stream-caret" />}
                  </div>
                </div>
              )}`,
  `              {streaming && (
                <div className="flex flex-col justify-start gap-2">
                  {activeTools.length > 0 && (
                    <div className="flex flex-col gap-1 pl-1">
                      {activeTools.map((t, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Aria is using {t}...
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {streamText || <span className="stream-caret" />}
                    </div>
                  </div>
                </div>
              )}`
);

fs.writeFileSync('src/app/onboarding/page.tsx', code);
