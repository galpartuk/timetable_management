import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { Bolt as BoltIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import type { ToolProposal } from './types';

interface Props {
  proposal: ToolProposal;
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
}

/**
 * Confirmation card shown when the model asks to perform a mutating action.
 * The user must approve before the backend actually executes anything.
 */
export function ToolPreview({ proposal, onApprove, onReject }: Props) {
  const [working, setWorking] = useState<'approve' | 'reject' | null>(null);
  const handle = async (decision: 'approve' | 'reject', cb: () => any) => {
    setWorking(decision);
    try { await cb(); } finally { setWorking(null); }
  };

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'warning.light',
        background: 'linear-gradient(180deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0.02) 100%)',
        p: 2,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245, 158, 11, 0.16)',
          color: 'warning.dark',
        }}>
          <BoltIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'warning.dark', mb: 0.25 }}>
            דרושה אישור
          </Typography>
          <Chip size="small" label={proposal.name} sx={{ background: 'rgba(245,158,11,0.12)', color: 'warning.dark', fontSize: 11 }} />
        </Box>
      </Stack>

      {proposal.preview && (
        <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>
          {proposal.preview}
        </Typography>
      )}

      <Box
        component="pre"
        sx={{
          fontSize: 12,
          fontFamily: 'monospace',
          background: '#fff',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.25,
          m: 0,
          overflowX: 'auto',
          color: 'grey.700',
          dir: 'ltr',
        }}
      >
        {JSON.stringify(proposal.input, null, 2)}
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 1.75, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<CloseIcon fontSize="small" />}
          onClick={() => handle('reject', onReject)}
          disabled={working !== null}
        >
          ביטול
        </Button>
        <Button
          size="small"
          variant="contained"
          color="warning"
          startIcon={working === 'approve' ? <CircularProgress size={14} color="inherit" /> : <CheckIcon fontSize="small" />}
          onClick={() => handle('approve', onApprove)}
          disabled={working !== null}
        >
          אשר וביצוע
        </Button>
      </Stack>
    </Box>
  );
}
