import { Box, Typography } from '@mui/material';
import { AutoAwesome as SparkleIcon, Person as PersonIcon } from '@mui/icons-material';
import type { ChatMessage } from './types';

const ASSISTANT_BG = 'rgba(79, 70, 229, 0.06)';
const ASSISTANT_BORDER = 'rgba(79, 70, 229, 0.18)';
const USER_BG = '#ffffff';
const USER_BORDER = 'rgba(20, 24, 31, 0.10)';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const role = message.role;
  const text = extractText(message);

  // tool_result-only messages don't need a bubble — they're internal state.
  if (role === 'user' && Array.isArray(message.content) && message.content.every((b) => b.type === 'tool_result')) {
    return null;
  }

  if (!text) return null;

  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 28, height: 28, borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          background: role === 'assistant'
            ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
            : 'grey.100',
          color: role === 'assistant' ? '#fff' : 'grey.700',
        }}
      >
        {role === 'assistant'
          ? <SparkleIcon sx={{ fontSize: 16 }} />
          : <PersonIcon sx={{ fontSize: 16 }} />}
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          background: role === 'assistant' ? ASSISTANT_BG : USER_BG,
          border: '1px solid',
          borderColor: role === 'assistant' ? ASSISTANT_BORDER : USER_BORDER,
          borderRadius: 3,
          px: 1.75, py: 1.25,
        }}
      >
        <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
        </Typography>
      </Box>
    </Box>
  );
}

export function StreamingBubble({ text }: { text: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 28, height: 28, borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: '#fff',
          // Pulse so it's clear something is happening while we wait.
          animation: 'aiPulse 1.4s ease-in-out infinite',
          '@keyframes aiPulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
            '50%': { boxShadow: '0 0 0 6px rgba(99, 102, 241, 0)' },
          },
        }}
      >
        <SparkleIcon sx={{ fontSize: 16 }} />
      </Box>
      <Box
        sx={{
          flex: 1,
          background: ASSISTANT_BG,
          border: '1px solid',
          borderColor: ASSISTANT_BORDER,
          borderRadius: 3,
          px: 1.75, py: 1.25,
          minHeight: 32,
        }}
      >
        <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
          <Box component="span" sx={{
            display: 'inline-block', width: 7, height: 14, ml: 0.25,
            verticalAlign: 'text-bottom',
            background: 'currentColor', opacity: 0.55, borderRadius: '2px',
            animation: 'aiBlink 1s steps(2) infinite',
            '@keyframes aiBlink': { 'to': { opacity: 0 } },
          }} />
        </Typography>
      </Box>
    </Box>
  );
}

function extractText(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('\n')
    .trim();
}
