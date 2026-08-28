import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
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
      messages: [{ role: "user", content: "Search for info." }],
      tools: {
        exaSearch: gateway.tools.exaSearch()
      }
    });
    console.log(result.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
