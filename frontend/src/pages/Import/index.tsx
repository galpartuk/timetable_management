import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Typography, Button, Alert,
  Grid, Stack, IconButton,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  CloudUpload as CloudUploadIcon,
  Description as FileIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { downloadImportTemplate } from '../../api/client';
import ImportReview from '../../components/ImportReview';

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setFile(f);
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

  const reset = () => { setFile(null); setResult(null); setError(''); };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

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
          {!file && !result && (
            <Box
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              sx={{
                cursor: 'pointer', borderRadius: 4, border: '2px dashed',
                borderColor: dragOver ? 'primary.main' : 'grey.300',
                background: dragOver ? 'rgba(79,70,229,0.06)' : 'grey.50',
                py: { xs: 6, md: 8 }, px: 4, textAlign: 'center',
                transition: 'all 200ms', '&:hover': { borderColor: 'primary.main' },
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

          {file && !result && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', background: 'grey.50' }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.10)', color: 'success.main' }}>
                  <FileIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{file.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'grey.500' }}>{formatBytes(file.size)}</Typography>
                </Box>
                <IconButton onClick={reset} size="small"><CloseIcon fontSize="small" /></IconButton>
              </Box>
              <ImportReview file={file} onDone={(r) => setResult(r)} onCancel={reset} />
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

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
