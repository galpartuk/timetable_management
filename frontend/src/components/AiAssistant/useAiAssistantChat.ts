import { useCallback, useRef, useState } from 'react';
import { streamChat } from './streamClient';
import type { ChatMessage, ContentBlock, ModuleContext, ToolProposal } from './types';

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
  isStreaming: boolean;
  error: string | null;
}

const INITIAL: ChatState = {
  messages: [],
  streamingText: '',
  toolEvents: [],
  pendingProposals: [],
  pendingAssistantContent: null,
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
  const [state, setState] = useState<ChatState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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
    const { pendingAssistantContent, pendingProposals, messages } = state;
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

    // 2. Append assistant turn (with the tool_use) and a user tool_result
    //    so the model can react to whatever happened.
    const assistantMsg: ChatMessage = { role: 'assistant', content: pendingAssistantContent };
    const toolResultMsg: ChatMessage = {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: proposal.id,
        content: toolResultContent,
        is_error: isError,
      }],
    };
    const next = [...messages, assistantMsg, toolResultMsg];

    // 3. Remove this proposal from the pending list. If others remain,
    //    keep waiting for them. Once all are resolved, ask the model to
    //    wrap up.
    const remaining = pendingProposals.filter((p) => p.id !== proposal.id);
    setState((s) => ({
      ...s,
      messages: next,
      pendingProposals: remaining,
      pendingAssistantContent: remaining.length ? s.pendingAssistantContent : null,
      streamingText: '',
      toolEvents: [],
    }));

    if (remaining.length === 0) {
      setState((s) => ({ ...s, isStreaming: true, error: null }));
      await driveStream(next, ctx);
    }
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
