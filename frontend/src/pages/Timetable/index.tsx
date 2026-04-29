import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, CardContent, Button, ToggleButtonGroup,
  ToggleButton, MenuItem, TextField, CircularProgress, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { CalendarMonth, Add } from '@mui/icons-material';
import {
  getTimetables, createTimetable, generateTimetable,
  getTimetableByClass, getTimetableByTeacher,
  getClasses, getTeachers,
} from '../../api/client';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

export default function TimetablePage() {
  const { t } = useTranslation();
  const [timetables, setTimetables] = useState<any[]>([]);
  const [selectedTT, setSelectedTT] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class');
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [entries, setEntries] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    getTimetables().then((r) => {
      const list = r.data.results ?? [];
      setTimetables(list);
      if (list.length > 0) setSelectedTT(list[0]);
    }).catch(() => {});
    getClasses().then((r) => setClasses(r.data.results ?? [])).catch(() => {});
    getTeachers().then((r) => setTeachers(r.data.results ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTT || !selectedId) {
      setEntries([]);
      return;
    }
    const fetcher = viewMode === 'class' ? getTimetableByClass : getTimetableByTeacher;
    fetcher(selectedTT.id, selectedId as number)
      .then((r) => setEntries(r.data))
      .catch(() => setEntries([]));
  }, [selectedTT, selectedId, viewMode]);

  const handleGenerate = async () => {
    if (!selectedTT) return;
    setGenerating(true);
    setError('');
    try {
      const res = await generateTimetable(selectedTT.id);
      setSelectedTT(res.data);
      // Reload timetables list
      getTimetables().then((r) => setTimetables(r.data.results ?? []));
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה ביצירת מערכת שעות');
    } finally {
      setGenerating(false);
    }
  };

  // Build grid: periods x days
  const maxPeriod = 10;
  const grid: Record<string, any> = {};
  entries.forEach((entry) => {
    const key = `${entry.day}-${entry.period}`;
    grid[key] = entry;
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {t('timetable.title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<Add />} onClick={() => setShowCreate(true)}>
            {t('data.add')}
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={generating ? <CircularProgress size={20} color="inherit" /> : <CalendarMonth />}
            onClick={handleGenerate}
            disabled={generating || !selectedTT}
          >
            {generating ? t('timetable.generating') : t('timetable.generate')}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label={t('timetable.title')}
          value={selectedTT?.id ?? ''}
          onChange={(e) => {
            const tt = timetables.find((t: any) => t.id === Number(e.target.value));
            setSelectedTT(tt);
          }}
          sx={{ minWidth: 200 }}
        >
          {timetables.map((tt: any) => (
            <MenuItem key={tt.id} value={tt.id}>
              {tt.name} <Chip size="small" label={t(`timetable.${tt.status}`)} sx={{ ml: 1 }} />
            </MenuItem>
          ))}
        </TextField>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
        >
          <ToggleButton value="class">{t('timetable.viewByClass')}</ToggleButton>
          <ToggleButton value="teacher">{t('timetable.viewByTeacher')}</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          size="small"
          label={viewMode === 'class' ? t('timetable.selectClass') : t('timetable.selectTeacher')}
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          sx={{ minWidth: 200 }}
        >
          {viewMode === 'class'
            ? classes.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.display_name}</MenuItem>)
            : teachers.map((t: any) => <MenuItem key={t.id} value={t.id}>{t.full_name}</MenuItem>)
          }
        </TextField>
      </Box>

      {/* Timetable Grid */}
      {selectedTT && selectedId ? (
        <Card>
          <CardContent sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
              <thead>
                <tr>
                  <th style={{ padding: 8, border: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>
                    {t('timetable.period')}
                  </th>
                  {DAYS.map((day) => (
                    <th key={day} style={{ padding: 8, border: '1px solid #ddd', backgroundColor: '#f5f5f5', minWidth: 120 }}>
                      {t(`days.${day}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => (
                  <tr key={period}>
                    <td style={{ padding: 8, border: '1px solid #ddd', textAlign: 'center', fontWeight: 700, backgroundColor: '#fafafa' }}>
                      {period}
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const entry = grid[`${dayIdx + 1}-${period}`];
                      return (
                        <td
                          key={dayIdx}
                          style={{
                            padding: 8,
                            border: '1px solid #ddd',
                            textAlign: 'center',
                            backgroundColor: entry ? entry.subject_color + '22' : 'white',
                          }}
                        >
                          {entry && (
                            <>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: entry.subject_color }}>
                                {entry.subject_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {viewMode === 'class' ? entry.teacher_name : entry.class_name}
                              </Typography>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <CalendarMonth sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
            <Typography color="text.secondary">{t('timetable.noTimetable')}</Typography>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <CreateTimetableDialog
          onSave={async (data) => {
            const res = await createTimetable({ ...data, school: 1 });
            setShowCreate(false);
            getTimetables().then((r) => {
              const list = r.data.results ?? [];
              setTimetables(list);
              setSelectedTT(list.find((t: any) => t.id === res.data.id));
            });
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </Box>
  );
}

function CreateTimetableDialog({ onSave, onClose }: { onSave: (data: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', academic_year: '2025-2026' });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('data.add')} {t('timetable.title')}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth label={t('timetable.name')} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth label={t('timetable.year')} value={form.academic_year}
          onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
          margin="normal"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
