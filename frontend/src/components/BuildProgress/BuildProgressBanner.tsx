import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, LinearProgress, Stack, Typography, IconButton, Tooltip } from '@mui/material';
import { AutoAwesome, OpenInNew, Close as CloseIcon } from '@mui/icons-material';
import { useBuildProgress } from './BuildProgressContext';

const PHASE_LABELS: Record<string, { he: string; en: string }> = {
  starting: { he: 'מתחיל…', en: 'Starting…' },
  loading:  { he: 'טוען נתונים…', en: 'Loading data…' },
  building: { he: 'בונה את המודל…', en: 'Building model…' },
  solving:  { he: 'מחשב את הפתרון הטוב ביותר…', en: 'Searching for the best solution…' },
  writing:  { he: 'כותב את המערכת…', en: 'Writing the timetable…' },
};

/**
 * Slim app-bar banner: visible whenever the global store has an in-flight
 * build, regardless of which route is mounted. Clicking opens /timetable
 * focused on the building row.
 */
export default function BuildProgressBanner() {
  const { build, outcome, ackOutcome } = useBuildProgress();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'he';
  const [nowTs, setNowTs] = useState(Date.now());

  // Tick once a second while a build is live so the elapsed counter advances.
  useEffect(() => {
    if (!build) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [build]);

  // Auto-dismiss the outcome toast after 8 seconds so it doesn't linger.
  useEffect(() => {
    if (!outcome) return;
    const id = setTimeout(ackOutcome, 8000);
    return () => clearTimeout(id);
  }, [outcome, ackOutcome]);

  if (!build && !outcome) return null;

  if (build) {
    // Anchor the elapsed counter to the server's started_at when available so
    // the timer doesn't reset on navigation/reload.
    const anchorMs = build.startedAtServer != null
      ? build.startedAtServer * 1000
      : build.startedAtClient;
    const elapsed = Math.max(0, Math.floor((nowTs - anchorMs) / 1000));
    const mm = Math.floor(elapsed / 60);
    const elapsedStr = `${mm}:${String(elapsed % 60).padStart(2, '0')}`;
    const phaseLabel = PHASE_LABELS[build.phase ?? '']?.[isRtl ? 'he' : 'en']
      ?? (isRtl ? 'מעבד…' : 'Working…');
    const solving = build.phase === 'solving';
    const barValue = solving && build.maxTime
      ? Math.min(95, Math.max(3, (elapsed / build.maxTime) * 100))
      : undefined;

    return (
      <Box
        className="no-print"
        sx={{
          position: 'sticky', top: 0, zIndex: 1100,
          background: 'linear-gradient(180deg, rgba(99,102,241,0.10) 0%, rgba(99,102,241,0.04) 100%)',
          borderBottom: '1px solid', borderColor: 'rgba(99,102,241,0.20)',
          px: { xs: 2, md: 3 }, py: 1,
          backdropFilter: 'blur(8px)',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <AutoAwesome sx={{ color: 'primary.main', fontSize: 18 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }} noWrap>
                {build.timetableName
                  ? (isRtl ? `בונה "${build.timetableName}" — ${phaseLabel}` : `Building "${build.timetableName}" — ${phaseLabel}`)
                  : phaseLabel}
              </Typography>
              <Typography className="tabular-nums" sx={{ fontSize: 12, color: 'grey.600', ms: 'auto' }}>
                {elapsedStr}
              </Typography>
              {solving && (build.solutions ?? 0) > 0 && (
                <Typography sx={{ fontSize: 11, color: 'grey.600' }} noWrap>
                  {isRtl
                    ? `${build.solutions} פתרונות${build.objective != null ? ` · ${Math.round(build.objective)}` : ''}`
                    : `${build.solutions} solutions${build.objective != null ? ` · ${Math.round(build.objective)}` : ''}`}
                </Typography>
              )}
            </Stack>
            <LinearProgress
              variant={barValue != null ? 'determinate' : 'indeterminate'}
              value={barValue}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
          <Tooltip title={isRtl ? 'פתח את עמוד המערכת' : 'Open timetable page'}>
            <IconButton
              size="small"
              onClick={() => navigate(`/timetable?timetable=${build.timetableId}`)}
              sx={{ color: 'primary.main' }}
            >
              <OpenInNew fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    );
  }

  // Outcome toast (success / failure).
  const isFailure = outcome!.status === 'failed';
  return (
    <Box
      className="no-print"
      sx={{
        position: 'sticky', top: 0, zIndex: 1100,
        background: isFailure ? 'rgba(244,63,94,0.10)' : 'rgba(16,185,129,0.10)',
        borderBottom: '1px solid',
        borderColor: isFailure ? 'rgba(244,63,94,0.30)' : 'rgba(16,185,129,0.30)',
        px: { xs: 2, md: 3 }, py: 1.25,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: isFailure ? '#9f1239' : '#065f46', flex: 1 }} noWrap>
          {isFailure
            ? (isRtl
                ? `הבנייה של "${outcome!.timetableName ?? '—'}" נכשלה. פתחו את המערכת לפרטים.`
                : `Build of "${outcome!.timetableName ?? '—'}" failed. Open the timetable for details.`)
            : (isRtl
                ? `הבנייה של "${outcome!.timetableName ?? '—'}" הושלמה`
                : `Build of "${outcome!.timetableName ?? '—'}" completed`)}
        </Typography>
        <Tooltip title={isRtl ? 'פתח את עמוד המערכת' : 'Open timetable page'}>
          <IconButton
            size="small"
            onClick={() => {
              navigate(`/timetable?timetable=${outcome!.timetableId}`);
              ackOutcome();
            }}
            sx={{ color: isFailure ? '#9f1239' : '#065f46' }}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={ackOutcome} sx={{ color: isFailure ? '#9f1239' : '#065f46' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
