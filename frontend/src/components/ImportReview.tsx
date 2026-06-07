import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Button, Alert, LinearProgress, Stack, Checkbox,
  FormControlLabel, Divider, RadioGroup, Radio, CircularProgress,
} from '@mui/material';
import {
  Upload as UploadIcon, Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { uploadExcel, type ImportResponse } from '../api/client';

/**
 * Shared import flow: given an already-chosen file, runs a dry-run preview,
 * shows the summary + comparison + teacher-identity resolution, and commits
 * with the user's overrides on confirm. Used by both the Import page and the
 * Timetable page's upload dialog so the experience is identical everywhere a
 * timetable file is brought in.
 */
export default function ImportReview({ file, schoolId = 1, onDone, onCancel }: {
  file: File;
  schoolId?: number;
  onDone: (result: any) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);

  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, number | 'new'>>({});
  const [wipe, setWipe] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');

  // (Re)run the dry-run whenever the file or the wipe flag changes, so the
  // comparison numbers reflect what the commit will actually do.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPreviewing(true);
      setError('');
      try {
        const res = await uploadExcel(file, schoolId, { dryRun: true, wipeExisting: wipe });
        if (cancelled) return;
        setPreview(res.data);
        const amb = res.data.preview?.teacher_resolutions?.ambiguous ?? [];
        setResolutions(Object.fromEntries(amb.map((a) => [a.incoming, a.suggested])));
      } catch (e: any) {
        if (!cancelled) setError(e.response?.data?.error || L('תצוגה מקדימה נכשלה', 'Preview failed'));
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, wipe, schoolId]);

  const doCommit = async () => {
    setCommitting(true);
    setError('');
    try {
      const res = await uploadExcel(file, schoolId, {
        dryRun: false, wipeExisting: wipe, teacherOverrides: resolutions,
      });
      onDone(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || L('הייבוא נכשל', 'Import failed'));
    } finally {
      setCommitting(false);
    }
  };

  const p = preview?.preview;
  const busy = previewing || committing;

  return (
    <Box>
      <FormControlLabel
        sx={{ display: 'block', mb: 1 }}
        control={<Checkbox size="small" checked={wipe} onChange={(e) => setWipe(e.target.checked)} disabled={busy} />}
        label={
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {L('מחק נתונים קיימים לפני הייבוא', 'Clear existing data before import')}
          </Typography>
        }
      />

      {previewing && <LinearProgress sx={{ mb: 2 }} />}

      {p && (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>
            {L('סיכום תצוגה מקדימה', 'Preview summary')}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', mb: 2 }}>
            <Stat label={L('גיליונות', 'Sheets')} value={p.sheets_seen.length} />
            <Stat label={L('שורות שיבוצים', 'Assignment rows')} value={p.assignment_rows_total} />
            <Stat label={L('מקצועות', 'Subjects')} value={p.subjects_distinct} />
            <Stat label={L('מורים', 'Teachers')} value={p.teachers_distinct} />
          </Stack>

          {p.diff && (
            <Box sx={{ mb: 2, p: 1.5, background: 'rgba(79,70,229,0.04)', borderRadius: 2 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>
                {L('השוואה למצב הקיים', 'Comparison with existing data')}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <Stat label={L('מורים חדשים', 'New teachers')} value={p.diff.new_teachers_count} />
                <Stat label={L('מורים שיוסרו', 'Removed teachers')} value={p.diff.removed_teachers_count} />
                <Stat label={L('מקצועות חדשים', 'New subjects')} value={p.diff.new_subjects.length} />
                <Stat label={L('שינויי שעות', 'Hour changes')} value={p.diff.hours_changes_count} />
              </Stack>
            </Box>
          )}

          {(p.teacher_resolutions?.ambiguous_count ?? 0) > 0 && (
            <Box sx={{ mb: 1 }}>
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>
                {L('זיהוי מורים', 'Resolve teachers')}
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'grey.700', mb: 1.5 }}>
                {L(
                  `${p.teacher_resolutions!.ambiguous_count} שמות שדורשים הכרעה — מורה קיים או חדש? בחרנו ברירת מחדל; שנו לפי הצורך.`,
                  `${p.teacher_resolutions!.ambiguous_count} name(s) need a decision — existing teacher or new? We picked a sensible default; change as needed.`,
                )}
              </Typography>
              <Stack spacing={1.5}>
                {p.teacher_resolutions!.ambiguous.map((amb) => (
                  <Box key={amb.incoming} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.5 }}>"{amb.incoming}"</Typography>
                    <RadioGroup
                      value={String(resolutions[amb.incoming] ?? amb.suggested)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setResolutions((prev) => ({ ...prev, [amb.incoming]: v === 'new' ? 'new' : Number(v) }));
                      }}
                    >
                      {amb.choices.map((ch) => (
                        <FormControlLabel
                          key={String(ch.value)}
                          value={String(ch.value)}
                          control={<Radio size="small" />}
                          label={
                            <Typography sx={{ fontSize: 13 }}>
                              {isRtl
                                ? ch.label
                                : (ch.value === 'new'
                                    ? 'Create new teacher'
                                    : `Merge with ${amb.candidates.find((c) => c.id === ch.value)?.display_name ?? ch.value}`)}
                            </Typography>
                          }
                        />
                      ))}
                    </RadioGroup>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {p.warnings.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'warning.dark' }}>
                {L(`אזהרות (${p.warnings.length})`, `Warnings (${p.warnings.length})`)}
              </Typography>
              <Box sx={{ maxHeight: 140, overflow: 'auto', mt: 0.5 }}>
                {p.warnings.slice(0, 50).map((w, i) => (
                  <Typography key={i} sx={{ fontSize: 12, color: 'grey.700' }}>• {w}</Typography>
                ))}
              </Box>
            </Box>
          )}

          {p.errors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {p.errors.slice(0, 20).map((e, i) => (
                <Typography key={i} sx={{ fontSize: 12 }}>• {e}</Typography>
              ))}
            </Alert>
          )}
        </>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontSize: 12, color: 'grey.700', mb: 1.5 }}>
        {L('לאחר אישור הנתונים ייכתבו לבסיס הנתונים. הפעולה אינה הפיכה',
           'After confirming, the data is written to the database. This cannot be undone')}
        {wipe && <strong>{L(' וכל הנתונים הקיימים יימחקו תחילה', ' and all existing data is deleted first')}</strong>}.
      </Typography>
      {committing && <LinearProgress sx={{ mb: 1.5 }} />}
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={onCancel} disabled={busy}>{t('data.cancel')}</Button>
        <Button
          variant="contained" size="large" color={wipe ? 'error' : 'primary'}
          onClick={doCommit} disabled={busy || !p}
          startIcon={committing ? <CircularProgress size={16} color="inherit" />
            : previewing ? <AssessmentIcon /> : <UploadIcon />}
        >
          {committing ? t('import.uploading') : L('אשר וייבא', 'Confirm import')}
        </Button>
      </Stack>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, background: 'grey.50', border: '1px solid', borderColor: 'divider', minWidth: 92 }}>
      <Typography className="tabular-nums" sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 11, color: 'grey.600', mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}
