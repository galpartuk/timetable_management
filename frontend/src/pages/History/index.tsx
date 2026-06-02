import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Typography, Button, MenuItem, TextField,
  Stack, Chip, IconButton, Alert, CircularProgress, Tooltip, Divider,
} from '@mui/material';
import {
  Restore as RestoreIcon,
  Save as SaveIcon,
  AutoAwesome,
  TouchApp,
  Build as BuildIcon,
  History as HistoryIcon,
  OpenInNew,
} from '@mui/icons-material';
import {
  getTimetables, getTimetableSnapshots, createTimetableSnapshot,
  restoreTimetableSnapshot, type TimetableSnapshotRow,
} from '../../api/client';

/**
 * History page — lives in its own sidebar section so it doesn't crowd the
 * timetable view. Lists every snapshot for the selected timetable with a
 * one-click restore. Snapshots are created automatically before any
 * mutating action (AI or manual) and can also be saved manually here.
 *
 * Restoring snapshots the CURRENT state first (server-side) so undoing
 * an unwanted restore is just another restore.
 */
export default function HistoryPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const navigate = useNavigate();
  const [timetables, setTimetables] = useState<any[]>([]);
  const [selectedTtId, setSelectedTtId] = useState<number | ''>('');
  const [snapshots, setSnapshots] = useState<TimetableSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);  // snapshot id currently being acted on
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getTimetables().then((r) => {
      const list = r.data.results ?? [];
      setTimetables(list);
      if (!selectedTtId && list[0]) setSelectedTtId(list[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSnapshots = (ttId: number) => {
    setLoading(true);
    setError('');
    getTimetableSnapshots(ttId)
      .then((r) => setSnapshots(r.data))
      .catch((e) => setError(e.response?.data?.error || (isRtl ? 'טעינת הגרסאות נכשלה' : 'Failed to load snapshots')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (typeof selectedTtId === 'number') loadSnapshots(selectedTtId);
  }, [selectedTtId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSave = async () => {
    if (typeof selectedTtId !== 'number') return;
    setBusy(-1);
    setError('');
    try {
      await createTimetableSnapshot(selectedTtId);
      setSuccess(isRtl ? 'הגרסה נשמרה' : 'Snapshot saved');
      loadSnapshots(selectedTtId);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error || (isRtl ? 'השמירה נכשלה' : 'Save failed'));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (snap: TimetableSnapshotRow) => {
    if (typeof selectedTtId !== 'number') return;
    const msg = isRtl
      ? `לשחזר את הגרסה מ-${formatWhen(snap.created_at, isRtl)}? המצב הנוכחי יישמר אוטומטית כדי שתוכלו לחזור אליו.`
      : `Restore the snapshot from ${formatWhen(snap.created_at, isRtl)}? The current state will be auto-saved so you can come back to it.`;
    if (!confirm(msg)) return;
    setBusy(snap.id);
    setError('');
    try {
      await restoreTimetableSnapshot(selectedTtId, snap.id);
      setSuccess(isRtl ? 'הגרסה שוחזרה. רעננו את עמוד מערכת השעות לצפייה.' : 'Snapshot restored. Refresh the timetable page to view.');
      loadSnapshots(selectedTtId);
      setTimeout(() => setSuccess(''), 5000);
    } catch (e: any) {
      setError(e.response?.data?.error || (isRtl ? 'השחזור נכשל' : 'Restore failed'));
    } finally {
      setBusy(null);
    }
  };

  const selectedTt = useMemo(
    () => timetables.find((t) => t.id === selectedTtId) || null,
    [timetables, selectedTtId],
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            {isRtl ? 'ניהול גרסאות' : 'Version history'}
          </Typography>
          <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
            {isRtl
              ? 'כל שינוי במערכת השעות נשמר אוטומטית. כאן תוכלו לחזור לכל גרסה קודמת.'
              : 'Every change to the timetable is auto-saved. Restore any previous version here.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<OpenInNew />}
            onClick={() => navigate(`/timetable?timetable=${selectedTtId}`)}
            disabled={typeof selectedTtId !== 'number'}
          >
            {isRtl ? 'פתח את המערכת' : 'Open timetable'}
          </Button>
          <Button
            variant="contained"
            startIcon={busy === -1 ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleManualSave}
            disabled={busy !== null || typeof selectedTtId !== 'number'}
          >
            {isRtl ? 'שמור גרסה עכשיו' : 'Save snapshot now'}
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <TextField
            select
            size="small"
            label={isRtl ? 'מערכת שעות' : 'Timetable'}
            value={selectedTtId}
            onChange={(e) => setSelectedTtId(Number(e.target.value))}
            sx={{ minWidth: 280 }}
          >
            {timetables.length === 0 && (
              <MenuItem value="" disabled>{isRtl ? 'אין מערכות' : 'No timetables'}</MenuItem>
            )}
            {timetables.map((tt) => (
              <MenuItem key={tt.id} value={tt.id}>
                {tt.name} · {tt.academic_year}
              </MenuItem>
            ))}
          </TextField>
          {selectedTt && (
            <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mt: 1 }}>
              {isRtl ? 'סטטוס:' : 'Status:'} {selectedTt.status}
              {' · '}
              {snapshots.length} {isRtl ? 'גרסאות שמורות' : 'snapshots saved'}
              {snapshots.length >= 50 && (
                <> · {isRtl ? '(הוותיקות נמחקות אוטומטית מעל 50)' : '(oldest are auto-pruned past 50)'}</>
              )}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : snapshots.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'grey.500' }}>
              <HistoryIcon sx={{ fontSize: 40, opacity: 0.4, mb: 1 }} />
              <Typography sx={{ fontSize: 14, color: 'grey.700', mb: 0.5 }}>
                {isRtl ? 'עדיין אין גרסאות שמורות' : 'No snapshots yet'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'grey.500' }}>
                {isRtl
                  ? 'גרסאות יישמרו אוטומטית כשתבצעו שינויים, או לחצו על "שמור גרסה עכשיו".'
                  : 'Snapshots are saved automatically on any change, or click "Save snapshot now".'}
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />} spacing={0}>
              {snapshots.map((snap) => (
                <SnapshotRow
                  key={snap.id}
                  snap={snap}
                  isRtl={isRtl}
                  busy={busy === snap.id}
                  disabled={busy !== null}
                  onRestore={() => handleRestore(snap)}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function SnapshotRow({ snap, isRtl, busy, disabled, onRestore }: {
  snap: TimetableSnapshotRow;
  isRtl: boolean;
  busy: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  const { icon, color } = iconFor(snap.triggered_by);
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2,
      py: 1.5, px: { xs: 1, md: 1.5 },
      transition: 'background 120ms',
      '&:hover': { background: 'grey.50' },
    }}>
      <Box sx={{
        width: 36, height: 36, borderRadius: 2, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}1a`, color,
      }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {snap.triggered_by_display}
          </Typography>
          <Chip
            size="small"
            label={`${snap.entry_count} ${isRtl ? 'שיעורים' : 'lessons'}`}
            sx={{ height: 18, fontSize: 10 }}
          />
          <Typography variant="caption" sx={{ color: 'grey.500' }}>
            {formatWhen(snap.created_at, isRtl)}
          </Typography>
          {snap.actor_name && (
            <Typography variant="caption" sx={{ color: 'grey.500' }}>
              · {snap.actor_name}
            </Typography>
          )}
        </Stack>
        {snap.description && (
          <Typography variant="caption" sx={{ color: 'grey.600', mt: 0.25, display: 'block' }} noWrap>
            {snap.description}
          </Typography>
        )}
      </Box>
      <Tooltip title={isRtl ? 'שחזור לגרסה זו' : 'Restore this version'}>
        <span>
          <IconButton
            color="primary"
            disabled={disabled}
            onClick={onRestore}
          >
            {busy ? <CircularProgress size={18} /> : <RestoreIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

function iconFor(t: TimetableSnapshotRow['triggered_by']) {
  switch (t) {
    case 'ai_move':
    case 'ai_swap':
      return { icon: <AutoAwesome fontSize="small" />, color: '#6366f1' };
    case 'manual_move':
    case 'manual_swap':
      return { icon: <TouchApp fontSize="small" />, color: '#059669' };
    case 'manual_save':
      return { icon: <SaveIcon fontSize="small" />, color: '#0ea5e9' };
    case 'before_restore':
      return { icon: <RestoreIcon fontSize="small" />, color: '#f59e0b' };
    case 'before_build':
      return { icon: <BuildIcon fontSize="small" />, color: '#e11d48' };
    default:
      return { icon: <HistoryIcon fontSize="small" />, color: '#717987' };
  }
}

function formatWhen(iso: string, isRtl: boolean): string {
  const d = new Date(iso);
  const now = Date.now();
  const seconds = Math.floor((now - d.getTime()) / 1000);
  if (seconds < 60) return isRtl ? 'לפני רגע' : 'just now';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return isRtl ? `לפני ${m} דק׳` : `${m}m ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return isRtl ? `לפני ${h} שעות` : `${h}h ago`;
  }
  return d.toLocaleString(isRtl ? 'he-IL' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
