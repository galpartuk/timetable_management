import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Typography, Button, Alert, LinearProgress,
  List, ListItem, ListItemText,
} from '@mui/material';
import { Upload as UploadIcon, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { uploadExcel } from '../../api/client';

export default function ImportPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setFile(f);
      setResult(null);
      setError('');
    } else {
      setError('יש לבחור קובץ אקסל (.xlsx)');
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
      // Using school_id=1 as default - in production this would come from context
      const res = await uploadExcel(file, 1);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בייבוא');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        {t('import.title')}
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 6,
              textAlign: 'center',
              bgcolor: dragOver ? 'action.hover' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <UploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {t('import.dropzone')}
            </Typography>
            {file && (
              <Typography sx={{ mt: 2, fontWeight: 700 }}>
                {file.name}
              </Typography>
            )}
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </Box>

          {file && !result && (
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleUpload}
                disabled={uploading}
                startIcon={<UploadIcon />}
              >
                {uploading ? t('import.uploading') : t('import.upload')}
              </Button>
            </Box>
          )}

          {uploading && <LinearProgress sx={{ mt: 2 }} />}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          {result && (
            <Box sx={{ mt: 3 }}>
              <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
                {t('import.success')}
              </Alert>
              <List>
                <ListItem>
                  <ListItemText
                    primary={t('import.subjectsImported')}
                    secondary={result.subjects_imported}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('import.teachersImported')}
                    secondary={result.teachers_imported}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary={t('import.assignmentsImported')}
                    secondary={result.assignments_imported}
                  />
                </ListItem>
              </List>
              {result.errors?.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ErrorIcon color="warning" /> {t('import.errors')}
                  </Typography>
                  <List dense>
                    {result.errors.map((err: string, i: number) => (
                      <ListItem key={i}>
                        <ListItemText primary={err} />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
