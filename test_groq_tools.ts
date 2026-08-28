import { createGroq } from "@ai-sdk/groq";
import { generateText, tool } from "ai";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY
});

async function main() {
  try {
    const result = await generateText({
      model: groq(process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
      system: "You are a helpful assistant",
      messages: [{ role: "user", content: "Fetch mb's github profile." }],
      tools: {
        fetchGitHubProfile: tool({
          description: "Fetch public profile stats and top languages for a GitHub user.",
          parameters: z.object({ username: z.string() }),
          execute: async ({ username }) => {
            return { login: username, publicRepos: 10 };
          }
        })
      }
    });
    console.log(result.text);
    console.log(result.toolCalls);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
