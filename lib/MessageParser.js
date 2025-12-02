/**
 * Streaming Message Parser
 * Ported from Chef's message-parser.ts
 *
 * Parses streaming AI output containing <boltArtifact> and <boltAction> tags
 * for file operations and manages callbacks for real-time updates.
 */

const ARTIFACT_TAG_OPEN = "<boltArtifact";
const ARTIFACT_TAG_CLOSE = "</boltArtifact>";
const ACTION_TAG_OPEN = "<boltAction";
const ACTION_TAG_CLOSE = "</boltAction>";

/**
 * Clean markdown code block syntax from content
 * @param {string} content
 * @returns {string}
 */
function cleanMarkdownSyntax(content) {
  const codeBlockRegex = /^\s*```[\w]*\n?([\s\S]*?)\n?\s*```\s*$/;
  const match = content.match(codeBlockRegex);
  return match ? match[1] : content;
}

/**
 * Clean escaped HTML tags
 * @param {string} content
 * @returns {string}
 */
function cleanEscapedTags(content) {
  return content.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Streaming Message Parser Class
 * Tracks parsing state across streaming chunks
 */
export class StreamingMessageParser {
  #messages = new Map();
  #callbacks = {};

  /**
   * @param {Object} options
   * @param {Function} options.onArtifactOpen - Called when artifact tag opens
   * @param {Function} options.onArtifactClose - Called when artifact tag closes
   * @param {Function} options.onActionOpen - Called when action tag opens (file creation starts)
   * @param {Function} options.onActionStream - Called during action content streaming
   * @param {Function} options.onActionClose - Called when action completes
   */
  constructor(options = {}) {
    this.#callbacks = options.callbacks || {};
  }

  /**
   * Parse a chunk of streaming input
   * @param {string} messageId - Unique identifier for this message stream
   * @param {string} input - The full accumulated input so far
   * @returns {string} - Any text output (non-artifact content)
   */
  parse(messageId, input) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideArtifact: false,
        insideAction: false,
        currentArtifact: null,
        currentAction: null,
        actionId: 0,
      };
      this.#messages.set(messageId, state);
    }

    let output = "";
    let i = state.position;

    while (i < input.length) {
      // Inside an artifact
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        // Inside an action (file content)
        if (state.insideAction) {
          const closeIndex = input.indexOf(ACTION_TAG_CLOSE, i);
          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            // Action complete
            let actionContent = input.slice(i, closeIndex);

            if (currentAction && currentAction.type === "file") {
              // Clean content
              if (!currentAction.filePath.endsWith(".md")) {
                actionContent = cleanMarkdownSyntax(actionContent);
                actionContent = cleanEscapedTags(actionContent);
              }
              currentAction.content = actionContent.trim();

              // Notify action complete
              if (this.#callbacks.onActionClose) {
                this.#callbacks.onActionClose({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId),
                  action: currentAction,
                });
              }
            }

            state.insideAction = false;
            state.currentAction = null;
            i = closeIndex + ACTION_TAG_CLOSE.length;
            continue;
          } else {
            // Still streaming action content
            if (currentAction && currentAction.type === "file") {
              let streamContent = input.slice(i);
              if (!currentAction.filePath.endsWith(".md")) {
                streamContent = cleanEscapedTags(streamContent);
              }
              currentAction.content = streamContent;

              if (this.#callbacks.onActionStream) {
                this.#callbacks.onActionStream({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId),
                  action: { ...currentAction, content: streamContent },
                });
              }
            }
            // Wait for more content
            break;
          }
        }

        // Look for action tag or artifact close
        const actionOpenIndex = input.indexOf(ACTION_TAG_OPEN, i);
        const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

        // Check for action tag first
        if (
          actionOpenIndex !== -1 &&
          (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)
        ) {
          const actionEndIndex = input.indexOf(">", actionOpenIndex);

          if (actionEndIndex !== -1) {
            state.actionId++;
            const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);
            state.currentAction = this.#parseActionTag(actionTag);
            state.insideAction = true;

            if (this.#callbacks.onActionOpen) {
              this.#callbacks.onActionOpen({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId),
                action: state.currentAction,
              });
            }

            i = actionEndIndex + 1;
            continue;
          } else {
            // Incomplete tag, wait for more
            break;
          }
        }

        // Check for artifact close
        if (artifactCloseIndex !== -1) {
          if (this.#callbacks.onArtifactClose) {
            this.#callbacks.onArtifactClose({
              messageId,
              ...currentArtifact,
            });
          }

          state.insideArtifact = false;
          state.currentArtifact = null;
          i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          continue;
        }

        // No complete tag found, wait for more
        break;
      }

      // Look for artifact opening
      const artifactOpenIndex = input.indexOf(ARTIFACT_TAG_OPEN, i);

      if (artifactOpenIndex !== -1) {
        // Output any text before the artifact
        output += input.slice(i, artifactOpenIndex);

        const artifactEndIndex = input.indexOf(">", artifactOpenIndex);

        if (artifactEndIndex !== -1) {
          const artifactTag = input.slice(
            artifactOpenIndex,
            artifactEndIndex + 1
          );
          state.currentArtifact = this.#parseArtifactTag(artifactTag);
          state.insideArtifact = true;
          state.actionId = 0;

          if (this.#callbacks.onArtifactOpen) {
            this.#callbacks.onArtifactOpen({
              messageId,
              ...state.currentArtifact,
            });
          }

          i = artifactEndIndex + 1;
          continue;
        } else {
          // Incomplete tag, wait for more
          break;
        }
      } else {
        // No artifact tag, output remaining text
        output += input.slice(i);
        i = input.length;
      }
    }

    state.position = i;
    return output;
  }

  /**
   * Parse artifact tag attributes
   * @param {string} tag
   * @returns {Object}
   */
  #parseArtifactTag(tag) {
    return {
      id: this.#extractAttribute(tag, "id") || "artifact",
      title: this.#extractAttribute(tag, "title") || "Generated Code",
    };
  }

  /**
   * Parse action tag attributes
   * @param {string} tag
   * @returns {Object}
   */
  #parseActionTag(tag) {
    const type = this.#extractAttribute(tag, "type") || "file";
    const action = { type, content: "" };

    if (type === "file") {
      action.filePath = this.#extractAttribute(tag, "filePath") || "";
      // Normalize path
      if (action.filePath.startsWith("/")) {
        action.filePath = action.filePath.slice(1);
      }
    }

    return action;
  }

  /**
   * Extract attribute value from tag
   * @param {string} tag
   * @param {string} attributeName
   * @returns {string|null}
   */
  #extractAttribute(tag, attributeName) {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, "i"));
    return match ? match[1] : null;
  }

  /**
   * Reset parser state for a message
   * @param {string} messageId
   */
  reset(messageId) {
    if (messageId) {
      this.#messages.delete(messageId);
    } else {
      this.#messages.clear();
    }
  }
}

/**
 * Strip all artifact tags from content (for clean text display)
 * @param {string} content
 * @returns {string}
 */
export function stripArtifacts(content) {
  let result = "";
  let i = 0;

  while (i < content.length) {
    const startIndex = content.indexOf(ARTIFACT_TAG_OPEN, i);
    if (startIndex === -1) {
      result += content.slice(i);
      break;
    }
    result += content.slice(i, startIndex);
    const endIndex = content.indexOf(ARTIFACT_TAG_CLOSE, startIndex);
    if (endIndex === -1) {
      break;
    }
    i = endIndex + ARTIFACT_TAG_CLOSE.length;
  }

  return result.trim();
}

export { cleanMarkdownSyntax, cleanEscapedTags };
