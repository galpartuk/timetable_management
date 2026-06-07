import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Chip, IconButton, InputBase, Stack, Typography, CircularProgress,
} from '@mui/material';
import {
  Send as SendIcon, Check as CheckIcon,
  AutoAwesome as SparkleIcon, Error as ErrorIcon,
} from '@mui/icons-material';
import { MessageBubble, StreamingBubble } from './Message';
import { ToolPreview } from './ToolPreview';
import type { ModuleContext } from './types';
import { useAiAssistantChat } from './useAiAssistantChat';
import { useAiAssistant } from './AiAssistantContext';

interface Props {
  ctx: ModuleContext;
}

/** Message list + composer + quick actions, all in one panel. */
export function ChatPanel({ ctx }: Props) {
  const { state, sendMessage, resolveProposal, reset } = useAiAssistantChat();
  const { consumePrefill, state: { autoApprove, clearRequest } } = useAiAssistant();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoResolvingRef = useRef(false);
  const lastClearRef = useRef(clearRequest);

  // Pull a one-shot prefill set via openWith(text) — used by handoffs like
  // the lesson popover so the user lands in the panel with a ready prompt.
  useEffect(() => {
    const text = consumePrefill();
    if (text) setDraft(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wipe in-memory + localStorage history whenever the shell asks
  // (requestClear bumps the counter). The ref skips the initial mount so
  // we don't reset on first render.
  useEffect(() => {
    if (clearRequest !== lastClearRef.current) {
      lastClearRef.current = clearRequest;
      reset();
      setDraft('');
    }
  }, [clearRequest, reset]);

  // Auto-approve mode: when on AND proposals appear, click "approve" on each
  // sequentially. The chat hook already buffers tool_results across multiple
  // proposals (PR #20) so this resolves cleanly in one round-trip. The guard
  // ref prevents re-entry while a resolve is in-flight.
  useEffect(() => {
    if (!autoApprove) return;
    if (state.pendingProposals.length === 0) return;
    if (autoResolvingRef.current) return;
    const proposal = state.pendingProposals[0];
    autoResolvingRef.current = true;
    void resolveProposal(proposal, 'approve', ctx).finally(() => {
      autoResolvingRef.current = false;
    });
  }, [autoApprove, state.pendingProposals, resolveProposal, ctx]);

  // Auto-scroll to the latest message / token.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.messages, state.streamingText, state.toolEvents, state.pendingProposals]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state.isStreaming) return;
    setDraft('');
    void sendMessage(trimmed, ctx);
  };

  const isEmpty = state.messages.length === 0 && !state.streamingText && !state.error;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Scrollable conversation */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          px: 2.5, py: 2,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        {isEmpty && <EmptyState ctx={ctx} onPick={submit} />}

        {state.messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {/* Inline status pills for read-only tool calls */}
        {state.toolEvents.length > 0 && (
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
            {state.toolEvents.map((te, i) => (
              <Chip
                key={i}
                size="small"
                icon={te.status === 'running'
                  ? <CircularProgress size={12} thickness={6} />
                  : <CheckIcon sx={{ fontSize: 14 }} />}
                label={te.name}
                sx={{
                  background: te.status === 'running' ? 'rgba(99,102,241,0.10)' : 'rgba(16,185,129,0.10)',
                  color: te.status === 'running' ? 'primary.dark' : 'success.dark',
                  fontWeight: 600, fontSize: 11,
                }}
              />
            ))}
          </Stack>
        )}

        {state.isStreaming && <StreamingBubble text={state.streamingText} />}

        {state.pendingProposals.map((p) => (
          <ToolPreview
            key={p.id}
            proposal={p}
            onApprove={() => resolveProposal(p, 'approve', ctx)}
            onReject={() => resolveProposal(p, 'reject', ctx)}
          />
        ))}

        {state.error && (
          <Box sx={{
            display: 'flex', alignItems: 'flex-start', gap: 1,
            p: 1.5, borderRadius: 2,
            border: '1px solid', borderColor: 'error.light',
            background: 'rgba(244, 63, 94, 0.06)',
            color: 'error.dark',
          }}>
            <ErrorIcon sx={{ fontSize: 18, mt: '2px' }} />
            <Typography sx={{ fontSize: 13 }}>{state.error}</Typography>
          </Box>
        )}
      </Box>

      {/* Composer */}
      <Box sx={{
        p: 1.5,
        borderTop: '1px solid', borderColor: 'divider',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'saturate(180%) blur(10px)',
      }}>
        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); submit(draft); }}
          sx={{
            display: 'flex', alignItems: 'flex-end', gap: 1,
            background: '#fff',
            border: '1px solid', borderColor: 'divider',
            borderRadius: 3,
            px: 1.5, py: 1,
            transition: 'box-shadow 160ms cubic-bezier(0.22, 1, 0.36, 1)',
            '&:focus-within': { boxShadow: '0 0 0 4px rgba(79,70,229,0.14)', borderColor: 'primary.main' },
          }}
        >
          <InputBase
            multiline
            maxRows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder={L('שאל את ה-AI… (Enter לשליחה, Shift+Enter לשורה חדשה)', 'Ask the AI… (Enter to send, Shift+Enter for a new line)')}
            sx={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}
            disabled={state.isStreaming}
          />
          <IconButton
            type="submit"
            disabled={!draft.trim() || state.isStreaming}
            size="small"
            sx={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              width: 32, height: 32,
              '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #4338ca)' },
              '&.Mui-disabled': { background: 'grey.200', color: 'grey.400' },
            }}
          >
            <SendIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

function EmptyState({ ctx, onPick }: { ctx: ModuleContext; onPick: (text: string) => void }) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
  return (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      <Box
        sx={{
          width: 56, height: 56, mx: 'auto', mb: 1.75, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(79,70,229,0.10))',
          color: 'primary.main',
          boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.20)',
        }}
      >
        <SparkleIcon />
      </Box>
      <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>
        {L('איך אפשר לעזור?', 'How can I help?')}
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'grey.600', mb: 2 }}>
        {L('שאל אותי כל דבר על המודול הזה, או בחר פעולה מהירה.', 'Ask me anything about this module, or pick a quick action.')}
      </Typography>

      {ctx.quickActions && ctx.quickActions.length > 0 && (
        <Stack spacing={1} sx={{ alignItems: 'stretch', maxWidth: 320, mx: 'auto' }}>
          {ctx.quickActions.map((qa, i) => (
            <Box
              key={i}
              onClick={() => onPick(qa.prompt)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onPick(qa.prompt); }}
              sx={{
                cursor: 'pointer',
                textAlign: 'start',
                px: 1.75, py: 1.25,
                borderRadius: 2,
                border: '1px solid', borderColor: 'divider',
                background: '#fff',
                fontSize: 13, fontWeight: 500,
                transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:hover': {
                  borderColor: 'primary.light',
                  background: 'rgba(79,70,229,0.04)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              {qa.label}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
