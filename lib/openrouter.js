import { createOpenAI } from "@ai-sdk/openai";

/**
 * Get OpenRouter provider using @ai-sdk/openai with custom baseURL
 * This matches Chef's approach of using the OpenAI SDK with custom providers
 */
export function getOpenRouterProvider() {
  const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_X_TITLE || "nixbuilder.dev",
    },
  });

  return openrouter;
}

export function getDefaultModel() {
  // Use Claude 3.5 Sonnet for faster responses
  return process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
}
