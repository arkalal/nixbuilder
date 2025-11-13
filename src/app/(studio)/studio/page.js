"use client";

import React, { useState, useEffect } from "react";
import StudioLayout from "../../../../components/Studio/StudioLayout/StudioLayout";
import Composer from "../../../../components/Studio/Composer/Composer";
import RightPanel from "../../../../components/Studio/RightPanel/RightPanel";
import styles from "./Studio.module.scss";

export default function StudioPage() {
  const [messages, setMessages] = useState([]);
  const [stage, setStage] = useState("idle"); // idle | planning | generating | previewing | done
  const [files, setFiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeTab, setActiveTab] = useState("code"); // code | preview | logs
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-3.5-sonnet");
  
  // Open-lovable style streaming state
  const [streamingCode, setStreamingCode] = useState("");
  const [currentFile, setCurrentFile] = useState(null); // { path, content, type }
  const [completedFiles, setCompletedFiles] = useState([]); // Persisted completed files for this generation
  
  // Parse files from streamingCode in real-time (EXACT open-lovable approach - lines 2874-2968)
  useEffect(() => {
    if (!streamingCode || stage !== "generating") return;
    
    // Extract ALL completed files from accumulated stream (open-lovable line 2889)
    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
    let match;
    const newFiles = [];
    
    // Build processedFiles Set from CURRENT state (open-lovable line 2891)
    const processedFiles = new Set(files.map(f => f.path));
    
    while ((match = fileRegex.exec(streamingCode)) !== null) {
      const filePath = match[1];
      const fileContent = match[2].trim();
      
      // Only add if we haven't processed this file yet (open-lovable line 2898)
      if (!processedFiles.has(filePath)) {
        const fileExt = filePath.split('.').pop();
        const fileType = (fileExt === 'jsx' || fileExt === 'js') ? 'javascript' :
                        (fileExt === 'css' || fileExt === 'scss') ? 'css' :
                        (fileExt === 'json') ? 'json' : 'text';
        
        // Add new file IMMEDIATELY (open-lovable line 2923-2929)
        console.log(`[Frontend] ✅ File completed: ${filePath} - Adding to files array`);
        newFiles.push({
          path: filePath,
          content: fileContent,
          type: fileType,
          createdAt: new Date().toISOString(),
          completed: true
        });
        processedFiles.add(filePath);
      }
    }
    
    // Add completed files to state IMMEDIATELY (open-lovable does this synchronously)
    if (newFiles.length > 0) {
      console.log(`[Frontend] 📂 Adding ${newFiles.length} completed files immediately`);
      setFiles(prev => [...prev, ...newFiles]);
      setCompletedFiles(prev => [...prev, ...newFiles.map(f => ({path: f.path, content: f.content}))]);
      
      // Auto-switch to Code tab on first file
      if (files.length === 0) {
        setActiveTab("code");
      }
    }
    
    // Check for current file being generated (incomplete file at the end) - open-lovable line 2941
    const lastFileMatch = streamingCode.match(/<file path="([^"]+)">([^]*?)$/);
    if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
      const filePath = lastFileMatch[1];
      const partialContent = lastFileMatch[2];
      
      // Only set if not yet completed (open-lovable line 2946)
      if (!processedFiles.has(filePath)) {
        const fileExt = filePath.split('.').pop();
        const fileType = (fileExt === 'jsx' || fileExt === 'js') ? 'javascript' :
                        (fileExt === 'css' || fileExt === 'scss') ? 'css' :
                        (fileExt === 'json') ? 'json' : 'text';
        
        // Set currentFile for streaming file (open-lovable line 2953-2956)
        console.log(`[Frontend] 📝 STREAMING: ${filePath} (${partialContent.length} chars)`);
        setCurrentFile({
          path: filePath,
          content: partialContent,
          type: fileType
        });
      }
    } else {
      // No incomplete file at end - clear currentFile (open-lovable line 2964)
      setCurrentFile(null);
    }
  }, [streamingCode, stage, files]);

  const handleSendMessage = async (message) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create AI message placeholder
    const aiMessageId = Date.now() + 1;
    const aiMessage = {
      id: aiMessageId,
      role: "assistant",
      content: "Analyzing your request...",
      timestamp: new Date().toISOString(),
      activities: [],
    };
    setMessages((prev) => [...prev, aiMessage]);

    try {
      // Call /api/chat with SSE
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, model: selectedModel }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error:", response.status, errorText);
        throw new Error(`API error: ${response.statusText}`);
      }

      console.log("Starting SSE stream...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("SSE stream ended");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            if (currentEvent) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                console.log("SSE event:", currentEvent, data);
                handleSSEEvent(currentEvent, data, aiMessageId);
                currentEvent = null;
              } catch (e) {
                console.error("Failed to parse SSE data:", e, line);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setStage("idle");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? {
                ...msg,
                content: `Error: ${error.message}`,
                activities: [
                  ...msg.activities,
                  {
                    id: Date.now(),
                    message: "Failed to generate plan",
                    status: "error",
                  },
                ],
              }
            : msg
        )
      );
    }
  };

  const handleSSEEvent = (event, data, messageId) => {
    switch (event) {
      case "stage":
        setStage(data.stage);
        if (data.stage === "generating") {
          console.log(`[Frontend] 🎬 NEW GENERATION STARTED - Clearing state`);
          setStreamingCode("");  // Clear streaming code on new generation
          setCurrentFile(null);
          setCompletedFiles([]);  // Clear completed files on new generation
          setFiles([]);  // Clear files array for fresh start
        }
        break;

      case "explanation":
        // Add explanation text to AI message (open-lovable approach)
        if (data.text) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                return {
                  ...msg,
                  content: data.text,
                };
              }
              return msg;
            })
          );
        }
        break;

      case "rawStream":
        // Accumulate all raw streaming text (open-lovable approach)
        if (data.text && data.raw) {
          setStreamingCode((prev) => prev + data.text);
        }
        break;

      case "activity":
        // Track current file being generated
        if (data.status === "in_progress" && data.file) {
          const fileType = data.file.split('.').pop();
          setCurrentFile({
            path: data.file,
            content: "",
            type: fileType === 'jsx' || fileType === 'js' ? 'javascript' :
                  fileType === 'scss' || fileType === 'css' ? 'css' :
                  fileType === 'json' ? 'json' : 'text'
          });
        } else if (data.status === "completed" && data.file) {
          // File generation completed - clear current file
          setCurrentFile(null);
        }
        
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  activities: [
                    ...msg.activities,
                    {
                      id: Date.now(),
                      message: data.message,
                      status: data.status || "in_progress",
                      file: data.file,
                    },
                  ],
                }
              : msg
          )
        );
        break;

      case "stream":
        // Stream AI response text (conversational only, no XML)
        if (data.content && typeof data.content === "string") {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                // On first stream event, clear the placeholder
                const currentContent = msg.content || "";
                const isPlaceholder = currentContent === "Analyzing your request...";
                const newContent = isPlaceholder 
                  ? data.content 
                  : currentContent + data.content;
                
                return {
                  ...msg,
                  content: newContent,
                };
              }
              return msg;
            })
          );
        }
        break;

      case "file_write":
        // Add file to files list AND completed files for chat display
        console.log(`[Frontend] 📄 file_write event: ${data.path}`);
        
        // Add to completed files array (persisted in chat)
        setCompletedFiles((prev) => [...prev, { path: data.path, content: data.content }]);
        
        // Add to files list (for Code tab)
        setFiles((prev) => {
          const existing = prev.find((f) => f.path === data.path);
          if (existing) {
            // Update existing file
            return prev.map((f) =>
              f.path === data.path
                ? { ...f, content: data.content, updatedAt: new Date().toISOString() }
                : f
            );
          }
          
          // Add new file
          const newFiles = [
            ...prev,
            {
              path: data.path,
              content: data.content,
              createdAt: new Date().toISOString(),
            },
          ];
          console.log(`[Frontend] ✅ Total files now: ${newFiles.length}`);
          
          // Auto-switch to Code tab when first file arrives (real-time UX)
          if (newFiles.length === 1) {
            console.log(`[Frontend] 🎯 Auto-switching to Code tab`);
            setActiveTab("code");
          }
          
          return newFiles;
        });
        break;

      case "complete":
        // All files generated
        console.log(`[Frontend] complete event received, files:`, data.files ? Object.keys(data.files).length : 0);
        
        // Clear streaming state BUT keep completedFiles and files (open-lovable approach)
        setStreamingCode("");
        setCurrentFile(null);
        // Don't clear completedFiles or files - they persist and were already parsed client-side
        
        // Only set files if we don't have any (fallback if client-side parsing failed)
        setFiles(prev => {
          if (prev.length > 0) {
            console.log(`[Frontend] ✅ Keeping ${prev.length} client-side parsed files`);
            return prev; // Keep existing files from client-side parsing
          }
          
          // Fallback: Use backend-parsed files if client-side parsing didn't work
          if (data.files) {
            const fileArray = Object.entries(data.files).map(([path, content]) => ({
              path,
              content,
              createdAt: new Date().toISOString(),
            }));
            console.log(`[Frontend] ⚠️ Using ${fileArray.length} backend-parsed files (fallback)`);
            return fileArray;
          }
          
          return prev;
        });
        
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
              // Only set default content if AI didn't stream conversational text
              const hasConversationalText = msg.content && msg.content !== "Analyzing your request...";
              return {
                ...msg,
                content: hasConversationalText
                  ? msg.content
                  : `Generated ${Object.keys(data.files || {}).length} files successfully!`,
              };
            }
            return msg;
          })
        );
        
        // Set stage to done to stop useEffect processing
        setStage("done");
        break;

      case "error":
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: `Error: ${data.message}`,
                  activities: [
                    ...msg.activities,
                    {
                      id: Date.now(),
                      message: data.message,
                      status: "error",
                    },
                  ],
                }
              : msg
          )
        );
        break;

      default:
        console.warn("Unknown SSE event:", event, data);
    }
  };

  return (
    <div className={styles.studioPage}>
      <StudioLayout
        leftPanel={
          <Composer
            messages={messages}
            stage={stage}
            onSendMessage={handleSendMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            streamingCode={streamingCode}
            currentFile={currentFile}
            completedFiles={completedFiles}
          />
        }
        rightPanel={
          <RightPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            files={files}
            logs={logs}
            previewUrl={previewUrl}
            stage={stage}
            currentFile={currentFile}
          />
        }
      />
    </div>
  );
}
