import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Button, Alert, LinearProgress, Stack, Checkbox,
  FormControlLabel, Divider, RadioGroup, Radio, CircularProgress, TextField,
} from '@mui/material';
import { Upload as UploadIcon } from '@mui/icons-material';
import { uploadExcel, cleanExcel, type ImportResponse } from '../api/client';

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
  const [showAssignments, setShowAssignments] = useState(false);
  const [query, setQuery] = useState('');
  const [cleaning, setCleaning] = useState(false);

  const doCleanDownload = async () => {
    setCleaning(true);
    setError('');
    try {
      const res = await cleanExcel(file);
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cleaned_timetable.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(L('ניקוי הקובץ נכשל', 'Cleaning the file failed'));
    } finally {
      setCleaning(false);
    }
  };

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
  const ap = p?.assignments_preview;
  const q = query.trim();
  const filteredAssignments = (ap?.rows ?? []).filter(
    (r) => !q || r.class.includes(q) || r.subject.includes(q) || r.teacher.includes(q),
  );

  return (
    <Box>
      <Box sx={{ mb: 2, p: 1.25, borderRadius: 1.5, border: '1px dashed', borderColor: 'primary.light', bgcolor: 'rgba(79,70,229,0.03)' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12, color: 'grey.700' }}>
            {L('רוצים גרסה מסודרת לתיקון לפני הייבוא? הורידו אקסל נקי (מורים מנורמלים, שורות חסרות מורה מסומנות).',
               'Want a tidied copy to fix before importing? Download a cleaned Excel (normalized teachers, missing-teacher rows flagged).')}
          </Typography>
          <Button size="small" variant="outlined" onClick={doCleanDownload} disabled={cleaning}>
            {cleaning ? L('מנקה…', 'Cleaning…') : L('הורד אקסל נקי', 'Download cleaned Excel')}
          </Button>
        </Stack>
      </Box>

      {previewing && !p && (
        <Box sx={{ py: 1, mb: 1 }}>
          <Typography sx={{ fontSize: 13, color: 'grey.600', mb: 1 }}>{L('מנתח…', 'Analyzing…')}</Typography>
          <LinearProgress />
        </Box>
      )}

      {p && (
        <>
          {previewing && <LinearProgress sx={{ mb: 1 }} />}
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

          {p.coverage && (
            <Box sx={{ mb: 2 }}>
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>
                {L('כיסוי צפוי במערכת', 'Expected timetable coverage')}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.700', mb: 1 }}>
                {L(
                  `${p.coverage.total_scheduled} ש"ש ישובצו · ${p.coverage.total_missing} ש"ש לא ישובצו (אין מורה) · ${p.coverage.classes_with_gaps} כיתות עם פערים`,
                  `${p.coverage.total_scheduled}h schedulable · ${p.coverage.total_missing}h can't be placed (no teacher) · ${p.coverage.classes_with_gaps} classes with gaps`,
                )}
              </Typography>
              <Box sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                {p.coverage.classes.map((c) => (
                  <Stack key={c.class} direction="row" sx={{ alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'grey.100' }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, minWidth: 48 }}>{c.class}</Typography>
                    <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: 'grey.200', overflow: 'hidden', display: 'flex' }}>
                      <Box sx={{ width: `${c.total_hours ? (c.scheduled_hours / c.total_hours) * 100 : 0}%`, bgcolor: '#10b981' }} />
                      <Box sx={{ width: `${c.total_hours ? (c.missing_hours / c.total_hours) * 100 : 0}%`, bgcolor: '#f43f5e' }} />
                    </Box>
                    <Typography sx={{ fontSize: 12, minWidth: 92, textAlign: isRtl ? 'left' : 'right', color: 'grey.700' }}>
                      {c.scheduled_hours}/{c.total_hours}
                      {c.missing_hours > 0 && (
                        <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}> (−{c.missing_hours})</Box>
                      )}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Box>
          )}

          {ap && (
            <Box sx={{ mb: 2 }}>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  {L('מורים לפי כיתה ומקצוע', 'Teachers by class & subject')} ({ap.total})
                </Typography>
                <Button size="small" onClick={() => setShowAssignments((s) => !s)}>
                  {showAssignments ? L('הסתר', 'Hide') : L('הצג לבדיקה', 'Show & verify')}
                </Button>
              </Stack>
              {showAssignments && (
                <>
                  <TextField
                    size="small" fullWidth value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L('סינון לפי כיתה / מקצוע / מורה', 'Filter by class / subject / teacher')}
                    sx={{ mb: 1 }}
                  />
                  <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                    <Stack direction="row" sx={{ position: 'sticky', top: 0, bgcolor: 'grey.100', px: 1, py: 0.5, fontSize: 11, fontWeight: 700 }}>
                      <Box sx={{ minWidth: 52 }}>{L('כיתה', 'Class')}</Box>
                      <Box sx={{ flex: 1 }}>{L('מקצוע', 'Subject')}</Box>
                      <Box sx={{ flex: 1 }}>{L('מורה', 'Teacher')}</Box>
                      <Box sx={{ minWidth: 36, textAlign: isRtl ? 'left' : 'right' }}>{L('ש"ש', 'Hrs')}</Box>
                    </Stack>
                    {filteredAssignments.slice(0, 400).map((a, i) => (
                      <Stack key={i} direction="row" sx={{ px: 1, py: 0.4, borderTop: '1px solid', borderColor: 'grey.100', fontSize: 12, opacity: a.active ? 1 : 0.5 }}>
                        <Box sx={{ minWidth: 52, fontWeight: 600 }}>{a.class}</Box>
                        <Box sx={{ flex: 1 }}>{a.subject}</Box>
                        <Box sx={{ flex: 1, color: a.teacher ? 'text.primary' : 'error.main', fontWeight: a.teacher ? 400 : 700 }}>
                          {a.teacher || L('(אין מורה)', '(no teacher)')}
                        </Box>
                        <Box sx={{ minWidth: 36, textAlign: isRtl ? 'left' : 'right' }}>{a.hours}</Box>
                      </Stack>
                    ))}
                    {filteredAssignments.length === 0 && (
                      <Typography sx={{ fontSize: 12, color: 'grey.500', p: 1 }}>{L('אין תוצאות', 'No matches')}</Typography>
                    )}
                  </Box>
                  {filteredAssignments.length > 400 && (
                    <Typography sx={{ fontSize: 11, color: 'grey.500', mt: 0.5 }}>
                      {L(`מוצגות 400 מתוך ${filteredAssignments.length} — צמצמו עם הסינון`,
                         `Showing 400 of ${filteredAssignments.length} — narrow with the filter`)}
                    </Typography>
                  )}
                </>
              )}
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

      {p && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: 12, color: 'grey.700', mb: 1.5 }}>
            {L('לאחר אישור הנתונים ייכתבו לבסיס הנתונים. הפעולה אינה הפיכה',
               'After confirming, the data is written to the database. This cannot be undone')}
            {wipe && <strong>{L(' וכל הנתונים הקיימים יימחקו תחילה', ' and all existing data is deleted first')}</strong>}.
          </Typography>
        </>
      )}
      {committing && <LinearProgress sx={{ mb: 1.5 }} />}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {/* The wipe option only appears once the preview is ready, so it is
            interactive when shown and sits aligned with the action buttons. */}
        {p ? (
          <FormControlLabel
            control={<Checkbox size="small" checked={wipe} onChange={(e) => setWipe(e.target.checked)} disabled={busy} />}
            label={
              <Typography sx={{ fontSize: 13 }}>
                {L('מחק נתונים קיימים לפני הייבוא', 'Clear existing data before import')}
              </Typography>
            }
          />
        ) : <Box />}
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" onClick={onCancel} disabled={committing}>{t('data.cancel')}</Button>
          <Button
            variant="contained" size="large" color={wipe ? 'error' : 'primary'}
            onClick={doCommit} disabled={busy || !p}
            startIcon={committing ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
          >
            {committing ? t('import.uploading') : L('אשר וייבא', 'Confirm import')}
          </Button>
        </Stack>
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
