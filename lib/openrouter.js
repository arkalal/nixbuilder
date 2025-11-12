import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getOpenRouterProvider() {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_X_TITLE || "nixbuilder.dev",
    },
  });

  return openrouter;
}

export function getDefaultModel() {
  // Use Claude 3.5 Sonnet for faster responses (3.7 is slower)
  return process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
}
