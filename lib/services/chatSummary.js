// Chat Summary Module
// Compresses long conversation history to save tokens while preserving context

import { streamText } from "ai";
import { getOpenRouterProvider, getDefaultModel } from "../openrouter.js";

// Threshold for when to summarize (number of messages)
const SUMMARY_THRESHOLD = 10;

// Max messages to keep in full (most recent)
const KEEP_RECENT_COUNT = 4;

// Max characters for summary
const MAX_SUMMARY_CHARS = 2000;

/**
 * Process chat history - summarize if too long
 * @param {Array} messages - Full message history
 * @param {Object} options - Processing options
 * @returns {Object} - Processed history with summary if needed
 */
export async function processHistory(messages, options = {}) {
  const {
    threshold = SUMMARY_THRESHOLD,
    keepRecent = KEEP_RECENT_COUNT,
    maxSummaryChars = MAX_SUMMARY_CHARS,
    model,
  } = options;

  // If history is short enough, return as-is
  if (messages.length <= threshold) {
    return {
      needsSummary: false,
      messages,
      summary: null,
    };
  }

  // Split into messages to summarize and recent messages to keep
  const toSummarize = messages.slice(0, -keepRecent);
  const recentMessages = messages.slice(-keepRecent);

  // Generate summary of older messages
  const summary = await generateSummary(toSummarize, {
    maxChars: maxSummaryChars,
    model,
  });

  return {
    needsSummary: true,
    messages: recentMessages,
    summary,
    summarizedCount: toSummarize.length,
  };
}

/**
 * Generate a summary of messages
 * @param {Array} messages - Messages to summarize
 * @param {Object} options - Summary options
 * @returns {string} - Summary text
 */
async function generateSummary(messages, options = {}) {
  const { maxChars = MAX_SUMMARY_CHARS, model } = options;

  // Format messages for summarization
  const conversationText = messages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = m.content || "";
      // Truncate very long messages
      const truncated =
        content.length > 500 ? content.substring(0, 500) + "..." : content;
      return `${role}: ${truncated}`;
    })
    .join("\n\n");

  // If conversation is already short, just return it formatted
  if (conversationText.length < maxChars) {
    return formatQuickSummary(messages);
  }

  try {
    const provider = getOpenRouterProvider();
    const modelId = model || getDefaultModel();

    const result = await streamText({
      model: provider(modelId),
      system: `You are a conversation summarizer. Create a concise summary that captures:
1. What the user is building (app type, features)
2. Key decisions made (tech choices, design choices)
3. Current state of the project
4. Any outstanding issues or next steps mentioned

Keep the summary under ${maxChars} characters. Focus on information that would be useful context for continuing the conversation.`,
      prompt: `Summarize this conversation:\n\n${conversationText}`,
      temperature: 0.3,
      maxTokens: 500,
    });

    // Collect the summary
    let summary = "";
    for await (const chunk of result.textStream) {
      summary += chunk;
    }

    return summary.trim();
  } catch (error) {
    console.error("[ChatSummary] Failed to generate AI summary:", error);
    // Fall back to quick summary
    return formatQuickSummary(messages);
  }
}

/**
 * Create a quick summary without AI
 * @param {Array} messages - Messages to summarize
 * @returns {string} - Quick summary
 */
function formatQuickSummary(messages) {
  const parts = [];

  // Count message types
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  parts.push(`Previous conversation: ${messages.length} messages`);

  // Extract key topics from user messages
  const topics = extractTopics(userMessages);
  if (topics.length > 0) {
    parts.push(`Topics discussed: ${topics.join(", ")}`);
  }

  // Get first user message (usually describes the project)
  if (userMessages.length > 0) {
    const firstRequest = userMessages[0].content;
    if (firstRequest) {
      const truncated =
        firstRequest.length > 200
          ? firstRequest.substring(0, 200) + "..."
          : firstRequest;
      parts.push(`Initial request: "${truncated}"`);
    }
  }

  // Get last user message
  if (userMessages.length > 1) {
    const lastRequest = userMessages[userMessages.length - 1].content;
    if (lastRequest) {
      const truncated =
        lastRequest.length > 150
          ? lastRequest.substring(0, 150) + "..."
          : lastRequest;
      parts.push(`Last request: "${truncated}"`);
    }
  }

  return parts.join("\n");
}

/**
 * Extract key topics from messages
 * @param {Array} messages - Messages to analyze
 * @returns {Array} - Extracted topics
 */
function extractTopics(messages) {
  const topics = new Set();

  // Keywords to look for
  const topicPatterns = [
    { pattern: /landing\s*page/i, topic: "landing page" },
    { pattern: /dashboard/i, topic: "dashboard" },
    { pattern: /auth|login|signup|sign\s*up/i, topic: "authentication" },
    { pattern: /database|mongodb|supabase/i, topic: "database" },
    { pattern: /api|backend|server/i, topic: "API/backend" },
    { pattern: /style|css|scss|design/i, topic: "styling" },
    { pattern: /button|component/i, topic: "components" },
    { pattern: /form|input/i, topic: "forms" },
    { pattern: /nav|navigation|menu/i, topic: "navigation" },
    { pattern: /responsive|mobile/i, topic: "responsive design" },
    { pattern: /animation|transition/i, topic: "animations" },
    { pattern: /deploy|vercel|production/i, topic: "deployment" },
    { pattern: /error|bug|fix/i, topic: "bug fixes" },
  ];

  for (const msg of messages) {
    const content = msg.content || "";
    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(content)) {
        topics.add(topic);
      }
    }
  }

  return Array.from(topics).slice(0, 6); // Max 6 topics
}

/**
 * Format history with summary for AI prompt
 * @param {Object} processed - Processed history from processHistory
 * @returns {string} - Formatted history string
 */
export function formatHistoryForPrompt(processed) {
  const parts = [];

  // Add summary if present
  if (processed.summary) {
    parts.push("CONVERSATION SUMMARY (earlier messages):");
    parts.push("-".repeat(40));
    parts.push(processed.summary);
    parts.push("-".repeat(40));
    parts.push("");
  }

  // Add recent messages
  if (processed.messages.length > 0) {
    parts.push("RECENT MESSAGES:");
    for (const msg of processed.messages) {
      const role = msg.role === "user" ? "USER" : "ASSISTANT";
      const content = msg.content || "";
      // Truncate assistant responses but keep user messages in full
      const truncated =
        msg.role === "assistant" && content.length > 300
          ? content.substring(0, 300) + "..."
          : content;
      parts.push(`${role}: ${truncated}`);
    }
  }

  return parts.join("\n");
}

/**
 * Extract project info from conversation
 * @param {Array} messages - All messages
 * @returns {Object} - Extracted project info
 */
export function extractProjectInfo(messages) {
  const info = {
    type: null,
    features: [],
    techStack: [],
    currentPhase: null,
  };

  const allContent = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join(" ");

  // Detect project type
  if (/e-?commerce|shop|store|product/i.test(allContent)) {
    info.type = "e-commerce";
  } else if (/blog|article|post/i.test(allContent)) {
    info.type = "blog";
  } else if (/dashboard|admin|panel/i.test(allContent)) {
    info.type = "dashboard";
  } else if (/landing|marketing|homepage/i.test(allContent)) {
    info.type = "landing page";
  } else if (/portfolio|personal/i.test(allContent)) {
    info.type = "portfolio";
  } else if (/saas|app|application/i.test(allContent)) {
    info.type = "web application";
  }

  // Detect features mentioned
  const featurePatterns = [
    { pattern: /auth|login/i, feature: "authentication" },
    { pattern: /dark\s*mode/i, feature: "dark mode" },
    { pattern: /responsive/i, feature: "responsive design" },
    { pattern: /animation/i, feature: "animations" },
    { pattern: /search/i, feature: "search" },
    { pattern: /filter/i, feature: "filtering" },
    { pattern: /pagination/i, feature: "pagination" },
    { pattern: /upload/i, feature: "file upload" },
    { pattern: /payment|stripe/i, feature: "payments" },
    { pattern: /email|newsletter/i, feature: "email" },
  ];

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(allContent)) {
      info.features.push(feature);
    }
  }

  // Detect tech stack
  if (/mongodb/i.test(allContent)) info.techStack.push("MongoDB");
  if (/supabase/i.test(allContent)) info.techStack.push("Supabase");
  if (/nextauth/i.test(allContent)) info.techStack.push("NextAuth");
  if (/shadcn/i.test(allContent)) info.techStack.push("shadcn/ui");
  if (/framer/i.test(allContent)) info.techStack.push("Framer Motion");

  return info;
}

/**
 * Check if conversation needs summarization
 * @param {Array} messages - Message history
 * @param {number} threshold - Message count threshold
 * @returns {boolean} - Whether summary is needed
 */
export function needsSummary(messages, threshold = SUMMARY_THRESHOLD) {
  return messages.length > threshold;
}
