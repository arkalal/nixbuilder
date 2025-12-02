/**
 * Message Parser Hook - Chef Architecture
 * Parses streaming messages and extracts artifacts/actions
 */

import { useCallback, useRef, useState } from "react";
import { workbenchStore } from "../stores/workbench";

// Tag constants (Chef pattern)
const ARTIFACT_TAG_OPEN = "<boltArtifact";
const ARTIFACT_TAG_CLOSE = "</boltArtifact>";
const ACTION_TAG_OPEN = "<boltAction";
const ACTION_TAG_CLOSE = "</boltAction>";

/**
 * Clean markdown code blocks from content
 */
function cleanMarkdownSyntax(content) {
  let cleaned = content;

  // Full code block with language
  const fullBlockRegex = /^\s*```[\w]*\n?([\s\S]*?)\n?```\s*$/;
  const fullMatch = cleaned.match(fullBlockRegex);
  if (fullMatch) {
    return fullMatch[1];
  }

  // Code blocks anywhere
  cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)\n```/g, "$1");

  // Inline backticks at start/end
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\n?```$/, "");
  }

  return cleaned;
}

/**
 * Clean escaped HTML entities
 */
function cleanEscapedTags(content) {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract attribute from tag
 */
function extractAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * Streaming Message Parser Class (Chef pattern)
 */
class StreamingMessageParser {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.states = new Map();
  }

  /**
   * Strip artifacts from content for display
   */
  static stripArtifacts(content) {
    let i = 0;
    let output = "";

    while (i < content.length) {
      const startIndex = content.indexOf(ARTIFACT_TAG_OPEN, i);
      if (startIndex === -1) {
        output += content.slice(i);
        break;
      }
      output += content.slice(i, startIndex);
      const endIndex = content.indexOf(ARTIFACT_TAG_CLOSE, startIndex);
      if (endIndex === -1) {
        break;
      }
      i = endIndex + ARTIFACT_TAG_CLOSE.length;
    }
    return output;
  }

  /**
   * Parse streaming input
   */
  parse(partId, input) {
    let state = this.states.get(partId);

    if (!state) {
      state = {
        position: 0,
        insideArtifact: false,
        insideAction: false,
        currentArtifact: null,
        currentAction: null,
        actionId: 0,
      };
      this.states.set(partId, state);
    }

    let output = "";
    let i = state.position;

    while (i < input.length) {
      if (state.insideArtifact) {
        if (state.insideAction) {
          const closeIndex = input.indexOf(ACTION_TAG_CLOSE, i);

          if (closeIndex !== -1) {
            // Action complete
            let content = input.slice(i, closeIndex).trim();

            if (state.currentAction?.type === "file") {
              if (!state.currentAction.filePath?.endsWith(".md")) {
                content = cleanMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }
              content += "\n";
            }

            state.currentAction.content = content;

            // Callback for action close (Chef pattern)
            this.callbacks.onActionClose?.({
              artifactId: state.currentArtifact.id,
              partId,
              actionId: String(state.actionId - 1),
              action: state.currentAction,
            });

            state.insideAction = false;
            state.currentAction = null;
            i = closeIndex + ACTION_TAG_CLOSE.length;
          } else {
            // Still streaming action
            if (state.currentAction?.type === "file") {
              let content = input.slice(i);
              if (!state.currentAction.filePath?.endsWith(".md")) {
                content = cleanMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }

              this.callbacks.onActionStream?.({
                artifactId: state.currentArtifact.id,
                partId,
                actionId: String(state.actionId - 1),
                action: { ...state.currentAction, content },
              });
            }
            break;
          }
        } else {
          // Inside artifact, look for action or close
          const actionOpenIndex = input.indexOf(ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (
            actionOpenIndex !== -1 &&
            (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)
          ) {
            const actionEndIndex = input.indexOf(">", actionOpenIndex);

            if (actionEndIndex !== -1) {
              const actionTag = input.slice(
                actionOpenIndex,
                actionEndIndex + 1
              );
              const type = extractAttribute(actionTag, "type") || "file";
              const filePath = extractAttribute(actionTag, "filePath");

              state.insideAction = true;
              state.currentAction = {
                type,
                filePath: filePath?.startsWith("/")
                  ? filePath.slice(1)
                  : filePath,
                content: "",
              };

              // Callback for action open
              this.callbacks.onActionOpen?.({
                artifactId: state.currentArtifact.id,
                partId,
                actionId: String(state.actionId++),
                action: state.currentAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            // Artifact closing
            this.callbacks.onArtifactClose?.({
              partId,
              ...state.currentArtifact,
            });

            state.insideArtifact = false;
            state.currentArtifact = null;
            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === "<") {
        // Look for artifact open
        const potentialTag = input.slice(i, i + ARTIFACT_TAG_OPEN.length);

        if (potentialTag === ARTIFACT_TAG_OPEN) {
          const openTagEnd = input.indexOf(">", i);

          if (openTagEnd !== -1) {
            const artifactTag = input.slice(i, openTagEnd + 1);
            const artifactTitle = extractAttribute(artifactTag, "title");
            const artifactId =
              extractAttribute(artifactTag, "id") || `artifact-${Date.now()}`;

            state.insideArtifact = true;
            state.currentArtifact = {
              id: artifactId,
              title: artifactTitle || "Untitled",
            };

            // Callback for artifact open
            this.callbacks.onArtifactOpen?.({
              partId,
              ...state.currentArtifact,
            });

            i = openTagEnd + 1;
          } else {
            break;
          }
        } else {
          output += input[i];
          i++;
        }
      } else {
        output += input[i];
        i++;
      }
    }

    state.position = i;
    return output;
  }

  reset(partId) {
    if (partId) {
      this.states.delete(partId);
    } else {
      this.states.clear();
    }
  }
}

/**
 * Create message parser instance with workbench callbacks (Chef pattern)
 */
export function createMessageParser() {
  return new StreamingMessageParser({
    onArtifactOpen: (data) => {
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      workbenchStore.updateArtifact(data.id, { closed: true });
    },
    onActionOpen: (data) => {
      workbenchStore.addAction(data);
    },
    onActionClose: (data) => {
      workbenchStore.addAction(data);
      workbenchStore.runAction(data, { isStreaming: false });
    },
    onActionStream: (data) => {
      workbenchStore.runAction(data, { isStreaming: true });
    },
  });
}

/**
 * useMessageParser hook (Chef pattern)
 */
export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState([]);
  const parserRef = useRef(createMessageParser());
  const cacheRef = useRef(new Map());

  const parseMessages = useCallback((messages) => {
    const parser = parserRef.current;
    const cache = cacheRef.current;
    const parsed = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (message.role === "user") {
        parsed.push(message);
        continue;
      }

      // Process assistant messages
      const cacheKey = `${message.id}-${i}`;
      const cached = cache.get(cacheKey);

      if (cached && cached.original === message.content) {
        parsed.push(cached.parsed);
        continue;
      }

      // Parse message parts
      let parsedContent = "";

      if (message.parts) {
        // AI SDK format with parts
        for (let j = 0; j < message.parts.length; j++) {
          const part = message.parts[j];
          const partId = `${message.id}-${j}`;

          if (part.type === "text") {
            parsedContent += parser.parse(partId, part.text);
          } else if (part.type === "tool-invocation") {
            // Handle tool calls
            workbenchStore.addArtifact({
              id: partId,
              title: "Processing...",
              partId,
            });
          }
        }
      } else if (message.content) {
        // Simple content format
        const partId = `${message.id}-content`;
        parsedContent = parser.parse(partId, message.content);
      }

      const parsedMessage = {
        ...message,
        displayContent: parsedContent,
      };

      cache.set(cacheKey, {
        original: message.content,
        parsed: parsedMessage,
      });

      parsed.push(parsedMessage);
    }

    setParsedMessages(parsed);
  }, []);

  const reset = useCallback(() => {
    parserRef.current?.reset();
    cacheRef.current.clear();
    setParsedMessages([]);
  }, []);

  return { parsedMessages, parseMessages, reset };
}

export { StreamingMessageParser };
export default useMessageParser;
