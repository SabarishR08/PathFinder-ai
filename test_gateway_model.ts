import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  try {
    const result = await generateText({
      model: gateway.languageModel("groq/llama-3.1-70b-versatile"),
      system: "You are a helpful assistant",
      messages: [{ role: "user", content: "Search for info on Vercel AI Gateway." }],
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
