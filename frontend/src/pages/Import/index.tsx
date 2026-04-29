import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Typography, Button, Alert, LinearProgress,
  Grid, Stack, IconButton,
} from '@mui/material';
import {
  Upload as UploadIcon,
  CheckCircle,
  Error as ErrorIcon,
  CloudUpload as CloudUploadIcon,
  Description as FileIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { uploadExcel } from '../../api/client';

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const isRtl = i18n.language === 'he';

  const handleFile = (f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setFile(f);
      setResult(null);
      setError('');
    } else {
      setError(isRtl ? 'יש לבחור קובץ אקסל (.xlsx)' : 'Please choose an Excel file (.xlsx)');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadExcel(file, 1);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || (isRtl ? 'שגיאה בייבוא' : 'Import failed'));
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          {t('import.title')}
        </Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          {isRtl
            ? 'העלו קובץ אקסל המכיל מקצועות, מורים ושיבוצים כדי לייבא את הנתונים בלחיצה אחת.'
            : 'Upload an Excel file with subjects, teachers, and assignments to import everything in one click.'}
        </Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          {!file && (
            <Box
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              sx={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 4,
                border: '2px dashed',
                borderColor: dragOver ? 'primary.main' : 'grey.300',
                background: dragOver
                  ? 'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(99,102,241,0.04))'
                  : 'grey.50',
                py: { xs: 6, md: 8 },
                px: 4,
                textAlign: 'center',
                transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:hover': {
                  borderColor: 'primary.main',
                  background: 'linear-gradient(135deg, rgba(79,70,229,0.05), rgba(99,102,241,0.03))',
                },
              }}
            >
              <Box
                sx={{
                  width: 72, height: 72, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  mb: 2,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#fff',
                  boxShadow: '0 12px 24px -8px rgba(79, 70, 229, 0.45)',
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>
                {t('import.dropzone')}
              </Typography>
              <Typography sx={{ color: 'grey.500', fontSize: 13 }}>
                {isRtl ? 'תומך ב־.xlsx, .xls · עד 10MB' : 'Supports .xlsx, .xls · up to 10MB'}
              </Typography>
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </Box>
          )}

          {file && !result && (
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  background: 'grey.50',
                }}
              >
                <Box
                  sx={{
                    width: 44, height: 44, borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(16, 185, 129, 0.10)',
                    color: 'success.main',
                  }}
                >
                  <FileIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{file.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'grey.500' }}>
                    {formatBytes(file.size)}
                  </Typography>
                </Box>
                <IconButton onClick={reset} size="small" disabled={uploading}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>

              {uploading && <LinearProgress sx={{ mt: 2 }} />}

              <Stack direction="row" spacing={1.5} sx={{ mt: 3, justifyContent: 'flex-end' }}>
                <Button variant="outlined" onClick={reset} disabled={uploading}>
                  {t('data.cancel')}
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleUpload}
                  disabled={uploading}
                  startIcon={<UploadIcon />}
                >
                  {uploading ? t('import.uploading') : t('import.upload')}
                </Button>
              </Stack>
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          {result && (
            <Box>
              <Alert
                severity="success"
                icon={<CheckCircle />}
                action={
                  <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={reset}>
                    {isRtl ? 'ייבוא נוסף' : 'Import another'}
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
                  <Typography
                    variant="subtitle2"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'warning.dark' }}
                  >
                    <ErrorIcon fontSize="small" /> {t('import.errors')}
                  </Typography>
                  <Box
                    sx={{
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'warning.light',
                      background: 'rgba(245, 158, 11, 0.06)',
                      p: 2,
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                  >
                    <Stack spacing={0.5}>
                      {result.errors.map((err: string, i: number) => (
                        <Typography key={i} sx={{ fontSize: 13, color: 'warning.dark', fontFamily: 'monospace' }}>
                          • {err}
                        </Typography>
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
  const t = TONES[tone];
  return (
    <Grid size={{ xs: 12, sm: 4 }}>
      <Box
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: t.bg,
        }}
      >
        <Typography
          className="tabular-nums"
          sx={{ fontSize: 28, fontWeight: 800, color: t.fg, lineHeight: 1, mb: 0.5 }}
        >
          {value ?? 0}
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'grey.600' }}>
          {label}
        </Typography>
      </Box>
    </Grid>
  );
}
