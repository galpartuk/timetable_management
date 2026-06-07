import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Typography, Button, Alert, LinearProgress,
  Grid, Stack, IconButton, Checkbox, FormControlLabel, Divider, Chip,
  RadioGroup, Radio, CircularProgress,
} from '@mui/material';
import {
  Upload as UploadIcon,
  CheckCircle,
  Error as ErrorIcon,
  CloudUpload as CloudUploadIcon,
  Description as FileIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { uploadExcel, downloadImportTemplate, type ImportResponse } from '../../api/client';

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, number | 'new'>>({});
  const [wipe, setWipe] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setFile(f);
      setPreview(null);
      setResolutions({});
      setResult(null);
      setError('');
    } else {
      setError(L('יש לבחור קובץ אקסל (.xlsx)', 'Please choose an Excel file (.xlsx)'));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const doPreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError('');
    try {
      const res = await uploadExcel(file, 1, { dryRun: true, wipeExisting: wipe });
      setPreview(res.data);
      const amb = res.data.preview?.teacher_resolutions?.ambiguous ?? [];
      setResolutions(Object.fromEntries(amb.map((a) => [a.incoming, a.suggested])));
    } catch (err: any) {
      setError(err.response?.data?.error || L('תצוגה מקדימה נכשלה', 'Preview failed'));
    } finally {
      setPreviewing(false);
    }
  };

  const doCommit = async () => {
    if (!file) return;
    setCommitting(true);
    setError('');
    try {
      const res = await uploadExcel(file, 1, {
        dryRun: false, wipeExisting: wipe, teacherOverrides: resolutions,
      });
      setResult(res.data);
      setPreview(null);
    } catch (err: any) {
      setError(err.response?.data?.error || L('הייבוא נכשל', 'Import failed'));
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResolutions({});
    setResult(null);
    setError('');
    setWipe(false);
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

  const p = preview?.preview;
  const busy = previewing || committing;

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'flex-end' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>{t('import.title')}</Typography>
          <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
            {L(
              'העלו קובץ אקסל, צפו בתצוגה מקדימה, הכריעו על זהות מורים — ואז ייבאו.',
              'Upload an Excel file, review a preview, resolve teacher identities — then import.',
            )}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={async () => {
            try {
              const res = await downloadImportTemplate();
              const url = URL.createObjectURL(res.data);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'timetable_template.xlsx';
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              setError(L('הורדת התבנית נכשלה', 'Template download failed'));
            }
          }}
        >
          {L('הורדת תבנית ריקה', 'Download blank template')}
        </Button>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          {/* Step 1 — choose a file */}
          {!file && !result && (
            <Box
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              sx={{
                position: 'relative', cursor: 'pointer', borderRadius: 4,
                border: '2px dashed', borderColor: dragOver ? 'primary.main' : 'grey.300',
                background: dragOver
                  ? 'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(99,102,241,0.04))'
                  : 'grey.50',
                py: { xs: 6, md: 8 }, px: 4, textAlign: 'center',
                transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Box sx={{
                width: 72, height: 72, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff',
                boxShadow: '0 12px 24px -8px rgba(79, 70, 229, 0.45)',
              }}>
                <CloudUploadIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>{t('import.dropzone')}</Typography>
              <Typography sx={{ color: 'grey.500', fontSize: 13 }}>
                {L('תומך ב־.xlsx, .xls · עד 10MB', 'Supports .xlsx, .xls · up to 10MB')}
              </Typography>
              <input
                id="file-input" type="file" accept=".xlsx,.xls" hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </Box>
          )}

          {/* Step 1b — file chosen, not yet previewed */}
          {file && !preview && !result && (
            <Box>
              <FileChip file={file} onClear={reset} disabled={busy} formatBytes={formatBytes} />
              <FormControlLabel
                sx={{ mt: 2, display: 'block' }}
                control={<Checkbox size="small" checked={wipe} onChange={(e) => setWipe(e.target.checked)} disabled={busy} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                      {L('מחק נתונים קיימים לפני הייבוא', 'Clear existing data before import')}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                      {L(
                        'ימחק מורים, מקצועות, שיבוצים ותפקידים לפני הייבוא. כיתות נשמרות.',
                        'Deletes teachers, subjects, assignments and roles before importing. Classes are kept.',
                      )}
                    </Typography>
                  </Box>
                }
              />
              {previewing && <LinearProgress sx={{ mt: 2 }} />}
              <Stack direction="row" spacing={1.5} sx={{ mt: 3, justifyContent: 'flex-end' }}>
                <Button variant="outlined" onClick={reset} disabled={busy}>{t('data.cancel')}</Button>
                <Button
                  variant="contained" size="large" onClick={doPreview} disabled={busy}
                  startIcon={previewing ? <CircularProgress size={16} color="inherit" /> : <AssessmentIcon />}
                >
                  {previewing ? L('מנתח…', 'Analyzing…') : L('תצוגה מקדימה', 'Preview')}
                </Button>
              </Stack>
            </Box>
          )}

          {/* Step 2 — preview + resolve + confirm */}
          {p && !result && (
            <Box>
              <FileChip file={file!} onClear={reset} disabled={busy} formatBytes={formatBytes} />

              <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 3, mb: 1.5 }}>
                {L('סיכום תצוגה מקדימה', 'Preview summary')}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', mb: 2 }}>
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
                  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                    <Stat label={L('מורים חדשים', 'New teachers')} value={p.diff.new_teachers_count} />
                    <Stat label={L('מורים שיוסרו', 'Removed teachers')} value={p.diff.removed_teachers_count} />
                    <Stat label={L('מקצועות חדשים', 'New subjects')} value={p.diff.new_subjects.length} />
                    <Stat label={L('שינויי שעות', 'Hour changes')} value={p.diff.hours_changes_count} />
                  </Stack>
                </Box>
              )}

              {/* Teacher identity resolution */}
              {(p.teacher_resolutions?.ambiguous_count ?? 0) > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Divider sx={{ my: 2 }} />
                  <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.5 }}>
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
                                  {/* Backend labels are Hebrew; render an English equivalent in EN mode. */}
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
                  <Box sx={{ maxHeight: 160, overflow: 'auto', mt: 0.5 }}>
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

              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontSize: 13, color: 'grey.700', mb: 1.5 }}>
                {L(
                  'לאחר אישור הנתונים ייכתבו לבסיס הנתונים. הפעולה אינה הפיכה',
                  'After confirming, the data is written to the database. This cannot be undone',
                )}
                {wipe && <strong>{L(' וכל הנתונים הקיימים יימחקו תחילה', ' and all existing data is deleted first')}</strong>}.
              </Typography>
              {committing && <LinearProgress sx={{ mb: 1.5 }} />}
              <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
                <Button variant="outlined" onClick={() => setPreview(null)} disabled={busy}>
                  {L('חזרה', 'Back')}
                </Button>
                <Button
                  variant="contained" size="large" color={wipe ? 'error' : 'primary'}
                  onClick={doCommit} disabled={busy}
                  startIcon={committing ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
                >
                  {committing ? t('import.uploading') : L('אשר וייבא', 'Confirm import')}
                </Button>
              </Stack>
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          {/* Step 3 — success */}
          {result && (
            <Box>
              <Alert
                severity="success" icon={<CheckCircle />}
                action={
                  <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={reset}>
                    {L('ייבוא נוסף', 'Import another')}
                  </Button>
                }
                sx={{ mb: 3 }}
              >
                {t('import.success')}
              </Alert>
              <Grid container spacing={2}>
                <ResultStat label={t('import.subjectsImported')} value={result.subjects_imported} tone="indigo" />
                <ResultStat label={t('import.teachersImported')} value={result.teachers_imported} tone="emerald" />
                <ResultStat label={t('import.assignmentsImported')} value={result.assignments_imported} tone="amber" />
              </Grid>
              {result.errors?.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'warning.dark' }}>
                    <ErrorIcon fontSize="small" /> {t('import.errors')}
                  </Typography>
                  <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'warning.light', background: 'rgba(245, 158, 11, 0.06)', p: 2, maxHeight: 240, overflowY: 'auto' }}>
                    <Stack spacing={0.5}>
                      {result.errors.map((err: string, i: number) => (
                        <Typography key={i} sx={{ fontSize: 13, color: 'warning.dark', fontFamily: 'monospace' }}>• {err}</Typography>
                      ))}
                    </Stack>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function FileChip({ file, onClear, disabled, formatBytes }: {
  file: File; onClear: () => void; disabled: boolean; formatBytes: (n: number) => string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', background: 'grey.50' }}>
      <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.10)', color: 'success.main' }}>
        <FileIcon />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{file.name}</Typography>
        <Typography variant="caption" sx={{ color: 'grey.500' }}>{formatBytes(file.size)}</Typography>
      </Box>
      <IconButton onClick={onClear} size="small" disabled={disabled}><CloseIcon fontSize="small" /></IconButton>
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

const TONES = {
  indigo:  { fg: '#4f46e5', bg: 'rgba(79, 70, 229, 0.08)'  },
  emerald: { fg: '#059669', bg: 'rgba(16, 185, 129, 0.10)' },
  amber:   { fg: '#d97706', bg: 'rgba(245, 158, 11, 0.12)' },
} as const;

function ResultStat({ label, value, tone }: { label: string; value: any; tone: keyof typeof TONES }) {
  const c = TONES[tone];
  return (
    <Grid size={{ xs: 12, sm: 4 }}>
      <Box sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', background: c.bg }}>
        <Typography className="tabular-nums" sx={{ fontSize: 28, fontWeight: 800, color: c.fg, lineHeight: 1, mb: 0.5 }}>
          {value ?? 0}
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'grey.600' }}>{label}</Typography>
      </Box>
    </Grid>
  );
}
