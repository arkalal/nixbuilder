/**
 * Streaming Message Parser - Ported from Chef's message-parser.ts
 * Parses <boltArtifact> and <boltAction> tags from streaming AI output
 */

const ARTIFACT_TAG_OPEN = "<boltArtifact";
const ARTIFACT_TAG_CLOSE = "</boltArtifact>";
const ACTION_TAG_OPEN = "<boltAction";
const ACTION_TAG_CLOSE = "</boltAction>";

/**
 * Clean markdown code block syntax from file content
 */
function cleanMarkdownSyntax(content) {
  let cleaned = content;

  // Pattern 1: Full code block with language
  const fullBlockRegex = /^\s*```[\w]*\n?([\s\S]*?)\n?```\s*$/;
  const fullMatch = cleaned.match(fullBlockRegex);
  if (fullMatch) {
    return fullMatch[1];
  }

  // Pattern 2: Code blocks anywhere
  cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)\n```/g, "$1");

  // Pattern 3: Inline backticks at start/end
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\n?```$/, "");
  }

  return cleaned;
}

/**
 * Clean escaped HTML tags
 */
function cleanEscapedTags(content) {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export class StreamingMessageParser {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.messages = new Map();
  }

  /**
   * Strip artifacts from content (for display)
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
   * Parse streaming input and extract artifacts/actions
   */
  parse(messageId, input) {
    let state = this.messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideArtifact: false,
        insideAction: false,
        currentArtifact: null,
        currentAction: null,
        actionId: 0,
      };
      this.messages.set(messageId, state);
    }

    let output = "";
    let i = state.position;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (state.insideAction) {
          const currentAction = state.currentAction;
          const closeIndex = input.indexOf(ACTION_TAG_CLOSE, i);

          if (closeIndex !== -1) {
            // Action complete
            let content = input.slice(i, closeIndex).trim();

            if (currentAction && currentAction.type === "file") {
              // Clean markdown syntax for non-markdown files
              if (!currentAction.filePath.endsWith(".md")) {
                content = cleanMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }
              content += "\n";
            }

            currentAction.content = content;

            // Callback for action close
            if (this.callbacks.onActionClose) {
              this.callbacks.onActionClose({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: currentAction,
              });
            }

            state.insideAction = false;
            state.currentAction = null;
            i = closeIndex + ACTION_TAG_CLOSE.length;
          } else {
            // Action still streaming
            if (currentAction && currentAction.type === "file") {
              let content = input.slice(i);

              if (!currentAction.filePath.endsWith(".md")) {
                content = cleanMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }

              if (this.callbacks.onActionStream) {
                this.callbacks.onActionStream({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId - 1),
                  action: {
                    ...currentAction,
                    content,
                  },
                });
              }
            }
            break;
          }
        } else {
          // Inside artifact but not inside action - look for action or artifact close
          const actionOpenIndex = input.indexOf(ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (
            actionOpenIndex !== -1 &&
            (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)
          ) {
            // Found action open
            const actionEndIndex = input.indexOf(">", actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;
              state.currentAction = this._parseActionTag(
                input,
                actionOpenIndex,
                actionEndIndex
              );

              if (this.callbacks.onActionOpen) {
                this.callbacks.onActionOpen({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId++),
                  action: state.currentAction,
                });
              }

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            // Artifact closing
            if (this.callbacks.onArtifactClose) {
              this.callbacks.onArtifactClose({
                messageId,
                ...currentArtifact,
              });
            }

            state.insideArtifact = false;
            state.currentArtifact = null;
            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === "<" && input[i + 1] !== "/") {
        // Look for artifact open
        let j = i;
        let potentialTag = "";

        while (
          j < input.length &&
          potentialTag.length < ARTIFACT_TAG_OPEN.length
        ) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== ">" && nextChar !== " ") {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf(">", j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);
              const artifactTitle = this._extractAttribute(
                artifactTag,
                "title"
              );
              const artifactId = this._extractAttribute(artifactTag, "id");
              const type = this._extractAttribute(artifactTag, "type");

              state.insideArtifact = true;
              state.currentArtifact = {
                id: artifactId || `artifact-${Date.now()}`,
                title: artifactTitle || "Untitled",
                type,
              };

              if (this.callbacks.onArtifactOpen) {
                this.callbacks.onArtifactOpen({
                  messageId,
                  ...state.currentArtifact,
                });
              }

              i = openTagEnd + 1;
            } else {
              // Tag not complete yet
              state.position = i;
              return output;
            }
            break;
          }

          j++;
        }

        if (potentialTag !== ARTIFACT_TAG_OPEN) {
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

  /**
   * Extract attribute value from tag
   */
  _extractAttribute(tag, name) {
    const match = tag.match(new RegExp(`${name}="([^"]*)"`));
    return match ? match[1] : null;
  }

  /**
   * Parse action tag to extract type and filePath
   */
  _parseActionTag(input, startIndex, endIndex) {
    const tag = input.slice(startIndex, endIndex + 1);
    const type = this._extractAttribute(tag, "type");
    const filePath = this._extractAttribute(tag, "filePath");

    // Normalize file path (remove leading slash if present)
    const normalizedPath = filePath?.startsWith("/")
      ? filePath.slice(1)
      : filePath;

    return {
      type: type || "file",
      filePath: normalizedPath,
      content: "",
    };
  }

  /**
   * Reset parser state for a message
   */
  reset(messageId) {
    if (messageId) {
      this.messages.delete(messageId);
    } else {
      this.messages.clear();
    }
  }
}
