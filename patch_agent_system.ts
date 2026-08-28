import fs from 'fs';
let code = fs.readFileSync('src/lib/onboarding/agent.ts', 'utf8');

code = code.replace(
  `  const messages: any[] = [
    { role: "system", content: agentSystemPrompt(state.phase as AgentPhase, learner.name) },
    { role: "system", content: \`Skill catalogue (id|name) — the ONLY valid skillIds:\\n\${await skillCatalogText(extractedSoFar.domain)}\` },
    { role: "system", content: \`Available domains: \${await domainOptionsText()}\` },
    { role: "system", content: \`Profile captured so far: \${JSON.stringify(extractedSoFar)}\` },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  const result = streamText({
    model: openaiProvider(process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
    messages,`,
  `  const systemPrompt = [
    agentSystemPrompt(state.phase as AgentPhase, learner.name),
    \`Skill catalogue (id|name) — the ONLY valid skillIds:\\n\${await skillCatalogText(extractedSoFar.domain)}\`,
    \`Available domains: \${await domainOptionsText()}\`,
    \`Profile captured so far: \${JSON.stringify(extractedSoFar)}\`
  ].join("\\n\\n");

  const messages: any[] = [
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  const result = streamText({
    model: openaiProvider(process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
    system: systemPrompt,
    messages,`
);

fs.writeFileSync('src/lib/onboarding/agent.ts', code);
