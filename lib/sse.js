// Server-Sent Events (SSE) utilities

export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller;
  let isClosed = false;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      // Cleanup on client disconnect
      isClosed = true;
    },
  });

  const send = (event, data) => {
    if (isClosed) return;
    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(message));
    } catch (error) {
      isClosed = true;
    }
  };

  const close = () => {
    if (isClosed) return;
    try {
      controller.close();
      isClosed = true;
    } catch (error) {
      // Already closed
      isClosed = true;
    }
  };

  return { stream, send, close };
}

export function createSSEResponse(stream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
