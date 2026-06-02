import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from './streamClient';
import type { ChatMessage, ContentBlock, ModuleContext, ToolProposal } from './types';

// Persist the chat across page reloads + drawer toggles. localStorage is
// per-browser, so this isn't a "cross-device history" feature — just
// continuity. Versioned key so we can change the shape later without
// reading stale JSON.
const STORAGE_KEY = 'ai_assistant.chat_history.v1';
// Cap on persisted messages — long tool_result content blocks can be big
// (a single list_classes result is ~10KB) and localStorage tops out around
// 5MB. 100 messages × ~10KB = 1MB worst case; comfortable headroom.
const MAX_PERSISTED_MESSAGES = 100;

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistMessages(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.length > MAX_PERSISTED_MESSAGES
      ? messages.slice(-MAX_PERSISTED_MESSAGES)
      : messages;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled — silent. The in-memory state
    // still works; only restoration on next load is lost.
  }
}

function clearStoredMessages(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

interface ToolEvent {
  name: string;
  status: 'running' | 'done' | 'error';
  result?: any;
}

interface ChatState {
  messages: ChatMessage[];
  streamingText: string;       // current assistant text being streamed
  toolEvents: ToolEvent[];     // inline status pills for read-only tools
  pendingProposals: ToolProposal[];   // mutating tools awaiting confirmation
  pendingAssistantContent: ContentBlock[] | null;  // ...the message they belong to
  // Tool-results collected as the user approves/rejects proposals one by one.
  // Flushed into ONE user message after the last proposal resolves — keeping
  // them in the order Anthropic expects (one tool_result per tool_use in the
  // preceding assistant turn). Storing intermediate results on `messages`
  // directly produced duplicate assistant turns and a 400 from the API.
  pendingResults: Array<{ tool_use_id: string; content: string; is_error: boolean }>;
  isStreaming: boolean;
  error: string | null;
}

const INITIAL: ChatState = {
  messages: [],
  streamingText: '',
  toolEvents: [],
  pendingProposals: [],
  pendingAssistantContent: null,
  pendingResults: [],
  isStreaming: false,
  error: null,
};

/**
 * Owns the chat history, drives the SSE stream, and orchestrates the
 * confirm-and-continue flow for mutating tools.
 *
 * Design notes:
 * - The frontend always owns the canonical message list. The backend is
 *   stateless; it just runs the next inference round given whatever we send.
 * - `streamingText` is the WIP assistant message — when the stream finishes
 *   without proposals we flush it into `messages` as a finalised entry.
 * - When proposals arrive, we stash the assistant's full content (which
 *   includes both text and tool_use blocks) into `pendingAssistantContent`
 *   so we can append it on confirmation along with a tool_result block.
 */
export function useAiAssistantChat() {
  // Hydrate from localStorage on hook init so the user picks up where they
  // left off after a page reload or drawer reopen. Only `messages` is
  // restored — streaming/pending/tool-event slices belong to an in-flight
  // turn and don't make sense to revive across loads.
  const [state, setState] = useState<ChatState>(() => ({
    ...INITIAL,
    messages: loadStoredMessages(),
  }));
  const abortRef = useRef<AbortController | null>(null);

  // Mirror every messages update to localStorage. Cheap (a single
  // JSON.stringify on the trimmed array) and synchronous, so reload-mid-
  // turn keeps everything that's been committed to history.
  useEffect(() => {
    persistMessages(state.messages);
  }, [state.messages]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearStoredMessages();
    setState(INITIAL);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  /** Send a fresh user-typed message. */
  const sendMessage = useCallback(async (text: string, ctx: ModuleContext) => {
    const userMsg: ChatMessage = { role: 'user', content: text };
    const baseMessages = [...state.messages, userMsg];
    setState((s) => ({
      ...s,
      messages: baseMessages,
      streamingText: '',
      toolEvents: [],
      isStreaming: true,
      error: null,
    }));
    await driveStream(baseMessages, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages]);

  /** User clicked Confirm/Cancel on a tool proposal. */
  const resolveProposal = useCallback(async (
    proposal: ToolProposal,
    decision: 'approve' | 'reject',
    ctx: ModuleContext,
  ) => {
    const { pendingAssistantContent, pendingProposals, pendingResults, messages } = state;
    if (!pendingAssistantContent) return;

    // 1. Execute (or refuse) the tool. Backend runs it for `approve`; for
    //    `reject` we synthesise a tool_result so the model knows we declined.
    let toolResultContent: string;
    let isError = false;
    if (decision === 'approve') {
      try {
        const csrf = document.cookie
          .split('; ').find((r) => r.startsWith('csrftoken='))?.split('=')[1];
        const res = await fetch('/api/ai/execute_tool/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRFToken': csrf } : {}),
          },
          body: JSON.stringify({
            module: ctx.module,
            view_state: ctx.viewState,
            tool_name: proposal.name,
            tool_input: proposal.input,
          }),
        });
        const data = await res.json();
        toolResultContent = JSON.stringify(data);
        if (data?.error) isError = true;
      } catch (e: any) {
        toolResultContent = JSON.stringify({ error: String(e) });
        isError = true;
      }
    } else {
      toolResultContent = JSON.stringify({ declined: true, reason: 'user rejected the proposed action' });
    }

    // 2. Buffer this result. The assistant turn (with ALL its tool_use blocks)
    //    can only be appended ONCE, and it must be followed by exactly ONE
    //    user message containing ALL the matching tool_results — otherwise
    //    the API returns 400 because the same tool_use ids end up duplicated
    //    across turns and each user turn is missing tool_results for the
    //    other tool_use blocks. Buffer until the last proposal resolves.
    const collectedResults = [
      ...pendingResults,
      { tool_use_id: proposal.id, content: toolResultContent, is_error: isError },
    ];
    const remaining = pendingProposals.filter((p) => p.id !== proposal.id);

    if (remaining.length > 0) {
      // Still waiting on other approvals — don't touch `messages` yet.
      setState((s) => ({
        ...s,
        pendingProposals: remaining,
        pendingResults: collectedResults,
        streamingText: '',
        toolEvents: [],
      }));
      return;
    }

    // 3. All resolved. Commit exactly one assistant turn + one user turn
    //    with every collected tool_result, in proposal order. Order matters
    //    for the model's reasoning but Anthropic doesn't require it match
    //    tool_use order; sorting by tool_use_id keeps it deterministic.
    const assistantMsg: ChatMessage = { role: 'assistant', content: pendingAssistantContent };
    const toolResultMsg: ChatMessage = {
      role: 'user',
      content: collectedResults.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.tool_use_id,
        content: r.content,
        is_error: r.is_error,
      })),
    };
    const next = [...messages, assistantMsg, toolResultMsg];

    setState((s) => ({
      ...s,
      messages: next,
      pendingProposals: [],
      pendingAssistantContent: null,
      pendingResults: [],
      streamingText: '',
      toolEvents: [],
      isStreaming: true,
      error: null,
    }));
    await driveStream(next, ctx);
  }, [state]);

  /** Internal: drive a single round of streaming, then commit to history. */
  const driveStream = async (messages: ChatMessage[], ctx: ModuleContext) => {
    const ac = new AbortController();
    abortRef.current = ac;

    let streamed = '';
    let toolEvents: ToolEvent[] = [];
    let proposals: ToolProposal[] = [];
    let pendingContent: ContentBlock[] | null = null;

    try {
      await streamChat('/api/ai/chat/', {
        module: ctx.module,
        view_state: ctx.viewState,
        messages,
      }, (event) => {
        if (event.type === 'text') {
          streamed += event.delta;
          setState((s) => ({ ...s, streamingText: streamed }));
        } else if (event.type === 'tool_running') {
          toolEvents = [...toolEvents, { name: event.name, status: 'running' }];
          setState((s) => ({ ...s, toolEvents }));
        } else if (event.type === 'tool_result') {
          toolEvents = toolEvents.map((te, i) =>
            i === toolEvents.length - 1 && te.name === event.name
              ? { ...te, status: 'done', result: event.result }
              : te,
          );
          setState((s) => ({ ...s, toolEvents }));
        } else if (event.type === 'tool_proposal') {
          proposals = event.proposals;
          pendingContent = event.assistant_content;
        } else if (event.type === 'error') {
          setState((s) => ({ ...s, error: event.message, isStreaming: false }));
        } else if (event.type === 'done') {
          // Final commit: if proposals are pending, pause for confirmation.
          // Otherwise flush the streamed text into history.
          setState((s) => {
            if (event.reason === 'awaiting_confirmation') {
              return {
                ...s,
                pendingProposals: proposals,
                pendingAssistantContent: pendingContent,
                isStreaming: false,
              };
            }
            const finalMessages = streamed.trim()
              ? [...s.messages, { role: 'assistant' as const, content: streamed }]
              : s.messages;
            return {
              ...s,
              messages: finalMessages,
              streamingText: '',
              isStreaming: false,
            };
          });
        }
      }, ac.signal);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setState((s) => ({ ...s, error: String(e), isStreaming: false }));
    }
  };

  return { state, sendMessage, resolveProposal, cancel, reset };
}
