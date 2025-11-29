"use client";

import { useEffect, useRef, memo } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  drawSelection,
  scrollPastEnd,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import styles from "./CodeMirrorEditor.module.scss";

/**
 * CodeMirrorEditor - Chef-style CodeMirror 6 editor for streaming code
 * Based on: chef/app/components/editor/codemirror/CodeMirrorEditor.tsx
 */

// Get language extension based on file type
function getLanguageExtension(filePath) {
  if (!filePath) return [];

  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
      return [javascript({ jsx: true, typescript: ext.includes("ts") })];
    case "css":
    case "scss":
    case "sass":
      return [css()];
    case "json":
      return [json()];
    case "html":
    case "htm":
      return [html()];
    default:
      return [];
  }
}

// Create base editor extensions (Chef-style)
function createEditorExtensions(
  editable,
  languageCompartment,
  editableCompartment
) {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    drawSelection(),
    indentUnit.of("  "),
    scrollPastEnd(),
    // Use compartment for dynamic editable state
    editableCompartment.of(EditorState.readOnly.of(!editable)),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    languageCompartment.of([]),
    vscodeDark,
    // Custom theme to match our dark UI
    EditorView.theme({
      "&": {
        fontSize: "13px",
        height: "100%",
      },
      "&.cm-editor": {
        height: "100%",
        backgroundColor: "#1a1a1c",
      },
      ".cm-scroller": {
        fontFamily: '"SF Mono", Monaco, Consolas, monospace',
        lineHeight: "1.6",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "16px 0",
      },
      ".cm-line": {
        padding: "0 16px",
      },
      ".cm-gutters": {
        backgroundColor: "#1a1a1c",
        borderRight: "none",
        paddingLeft: "8px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: "#4c4c4c",
        minWidth: "40px",
        paddingRight: "16px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
      },
      ".cm-cursor": {
        borderLeftColor: "#dcdcaa",
        borderLeftWidth: "2px",
      },
      ".cm-selectionBackground": {
        backgroundColor: "rgba(255, 255, 255, 0.1) !important",
      },
      "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgba(255, 255, 255, 0.15) !important",
      },
    }),
  ];
}

const CodeMirrorEditor = memo(function CodeMirrorEditor({
  doc,
  editable = true,
  scrollToDocAppend = false,
  onChange,
  className = "",
}) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const languageCompartmentRef = useRef(new Compartment());
  const editableCompartmentRef = useRef(new Compartment());
  const docRef = useRef(doc);

  // Update docRef when doc changes
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Initialize CodeMirror view once
  useEffect(() => {
    if (!containerRef.current) return;

    const languageCompartment = languageCompartmentRef.current;
    const editableCompartment = editableCompartmentRef.current;
    const extensions = createEditorExtensions(
      editable,
      languageCompartment,
      editableCompartment
    );

    // Add change listener if provided
    if (onChange) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged && docRef.current) {
            onChange({
              content: update.state.doc.toString(),
              filePath: docRef.current.filePath,
            });
          }
        })
      );
    }

    const state = EditorState.create({
      doc: doc?.value || "",
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update document content when it changes (Chef's approach)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !doc) return;

    const currentContent = view.state.doc.toString();
    const newContent = doc.value || "";

    // Only update if content actually changed (prevents glitches)
    if (newContent !== currentContent) {
      // Chef's approach: Replace entire document atomically
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: newContent,
        },
      });
    }

    // Update language support based on file path
    const languageCompartment = languageCompartmentRef.current;
    const langExt = getLanguageExtension(doc.filePath);
    view.dispatch({
      effects: languageCompartment.reconfigure(langExt),
    });
  }, [doc?.value, doc?.filePath]);

  // Handle scroll to bottom during streaming (Chef's approach)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scrollToDocAppend || !doc?.value) return;

    const currentContent = view.state.doc.toString();
    const newContent = doc.value || "";

    // Check if this is a simple append (streaming)
    const isSimpleAppend = newContent.startsWith(currentContent);

    if (isSimpleAppend && newContent.length > currentContent.length) {
      // Scroll to bottom with slight offset (Chef's scrollPastEnd approach)
      requestAnimationFrame(() => {
        const scrollDOM = view.scrollDOM;
        const pagesOffscreen =
          (scrollDOM.scrollHeight -
            scrollDOM.scrollTop -
            scrollDOM.offsetHeight) /
          scrollDOM.offsetHeight;

        // Only scroll if we're more than 0.9 pages away from bottom
        if (pagesOffscreen > 0.9) {
          const desiredPagesOffscreen = 0.5;
          scrollDOM.scrollTo(
            0,
            scrollDOM.scrollHeight -
              scrollDOM.offsetHeight * (desiredPagesOffscreen + 1)
          );
        }
      });
    }
  }, [doc?.value, scrollToDocAppend]);

  // Update editable state using compartment reconfigure
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const editableCompartment = editableCompartmentRef.current;
    view.dispatch({
      effects: editableCompartment.reconfigure(
        EditorState.readOnly.of(!editable)
      ),
    });
  }, [editable]);

  return (
    <div
      className={`${styles.editorWrapper} ${className}`}
      ref={containerRef}
    />
  );
});

export default CodeMirrorEditor;
