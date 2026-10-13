"use client";

import { useCallback, useRef, useState } from "react";

export interface StreamMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Client hook for streaming chat endpoints built with aiStreamResponse().
 * POSTs { messages, ...extra } as JSON and appends streamed text to the last assistant message.
 */
export function useStreamChat(endpoint: string, extra: Record<string, unknown> = {}, initial: StreamMessage[] = []) {
  const [messages, setMessages] = useState<StreamMessage[]>(initial);
  const [streaming, setStreaming] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || streaming) return;
      const history: StreamMessage[] = [...messages, { role: "user", content: text }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);
      setError(null);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history, ...extraRef.current }),
          signal: ac.signal,
        });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        setEngine(r.headers.get("x-engine"));
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          setMessages((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          });
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [endpoint, messages, streaming],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback((next: StreamMessage[] = []) => setMessages(next), []);

  return { messages, send, stop, reset, streaming, engine, error };
}
