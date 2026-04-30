import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiAssistantContext } from '../../components/AiAssistant';
import {
  Box, Typography, Card, CardContent, Button, ToggleButtonGroup,
  ToggleButton, MenuItem, TextField, CircularProgress, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
} from '@mui/material';
import { CalendarMonth, Add, AutoAwesome } from '@mui/icons-material';
import {
  getTimetables, createTimetable, generateTimetable,
  getTimetableByClass, getTimetableByTeacher,
  getClasses, getTeachers,
} from '../../api/client';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const MAX_PERIODS = 10;

const STATUS_CHIP: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  draft: 'default',
  generating: 'primary',
  completed: 'success',
  failed: 'error',
  published: 'warning',
};

export default function TimetablePage() {
  const { t, i18n } = useTranslation();
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
  const isRtl = i18n.language === 'he';

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
      getTimetables().then((r) => setTimetables(r.data.results ?? []));
    } catch (err: any) {
      setError(err.response?.data?.error || (isRtl ? 'שגיאה ביצירת מערכת שעות' : 'Failed to generate timetable'));
    } finally {
      setGenerating(false);
    }
  };

  const grid: Record<string, any> = {};
  entries.forEach((entry) => {
    const key = `${entry.day}-${entry.period}`;
    grid[key] = entry;
  });

  // Tell the AI assistant which timetable / view we're looking at, and
  // expose a few one-click prompts the user can pick from.
  useAiAssistantContext(useMemo(() => ({
    module: 'timetable',
    viewState: {
      timetable_id: selectedTT?.id ?? null,
      timetable_name: selectedTT?.name ?? null,
      timetable_status: selectedTT?.status ?? null,
      view_mode: viewMode,
      selected_entity_id: selectedId || null,
      visible_entry_count: entries.length,
    },
    quickActions: [
      { label: 'צור מערכת חדשה והפק אותה', prompt: 'צור מערכת שעות חדשה לשנת 2026-2027 בשם "מערכת חדשה" והפעל את הסולבר.' },
      { label: 'מצא התנגשויות במערכת', prompt: 'בדוק התנגשויות במערכת הנוכחית והצג רשימה מסודרת.' },
      { label: 'נקוד את המערכת ותן תובנות', prompt: 'תן לי סקירה של המערכת הנוכחית – כמה שיעורים, כמה מורים, ומה איכות הפיזור.' },
      { label: 'הראה לי את שיבוצי ההוראה', prompt: 'הצג את כל שיבוצי ההוראה הקיימים, כדי שאוכל לראות מה הסולבר מקבל כקלט.' },
    ],
  }), [selectedTT?.id, selectedTT?.name, selectedTT?.status, viewMode, selectedId, entries.length]));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            {t('timetable.title')}
          </Typography>
          <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
            {isRtl
              ? 'יצירה, צפייה ועריכה של מערכות שעות.'
              : 'Create, view, and refine timetables.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" startIcon={<Add />} onClick={() => setShowCreate(true)}>
            {t('data.add')}
          </Button>
          <Button
            variant="contained"
            startIcon={generating ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />}
            onClick={handleGenerate}
            disabled={generating || !selectedTT}
          >
            {generating ? t('timetable.generating') : t('timetable.generate')}
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              select
              size="small"
              label={t('timetable.title')}
              value={selectedTT?.id ?? ''}
              onChange={(e) => {
                const tt = timetables.find((tx: any) => tx.id === Number(e.target.value));
                setSelectedTT(tt);
              }}
              sx={{ minWidth: 220 }}
            >
              {timetables.length === 0 && (
                <MenuItem value="" disabled>{isRtl ? 'אין מערכות' : 'No timetables'}</MenuItem>
              )}
              {timetables.map((tt: any) => (
                <MenuItem key={tt.id} value={tt.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between', width: '100%' }}>
                    <span>{tt.name}</span>
                    <Chip size="small" label={t(`timetable.${tt.status}`)} color={STATUS_CHIP[tt.status] || 'default'} />
                  </Box>
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
              sx={{ minWidth: 220 }}
            >
              {viewMode === 'class'
                ? classes.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.display_name}</MenuItem>)
                : teachers.map((tx: any) => <MenuItem key={tx.id} value={tx.id}>{tx.full_name}</MenuItem>)
              }
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {selectedTT && selectedId ? (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, md: 2.5 }, overflowX: 'auto' }}>
            <TimetableGrid grid={grid} viewMode={viewMode} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ py: 8 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <Box
                sx={{
                  width: 88, height: 88, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(79,70,229,0.10), rgba(99,102,241,0.06))',
                  border: '1px dashed', borderColor: 'primary.light',
                  color: 'primary.main',
                  mb: 2,
                }}
              >
                <CalendarMonth sx={{ fontSize: 36 }} />
              </Box>
              <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>
                {isRtl ? 'בחרו מערכת ושיוך לתצוגה' : 'Select a timetable and entity'}
              </Typography>
              <Typography sx={{ color: 'grey.500', fontSize: 14, maxWidth: 380 }}>
                {t('timetable.noTimetable')}
              </Typography>
            </Box>
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
              setSelectedTT(list.find((tt: any) => tt.id === res.data.id));
            });
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </Box>
  );
}

function TimetableGrid({
  grid,
  viewMode,
}: {
  grid: Record<string, any>;
  viewMode: 'class' | 'teacher';
}) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(64px, 80px) repeat(5, minmax(120px, 1fr))',
        gap: 1,
        minWidth: 720,
      }}
    >
      <GridHeader>{t('timetable.period')}</GridHeader>
      {DAYS.map((day) => (
        <GridHeader key={day}>{t(`days.${day}`)}</GridHeader>
      ))}

      {Array.from({ length: MAX_PERIODS }, (_, i) => i + 1).map((period) => (
        <PeriodRow
          key={period}
          period={period}
          grid={grid}
          viewMode={viewMode}
        />
      ))}
    </Box>
  );
}

function PeriodRow({
  period,
  grid,
  viewMode,
}: {
  period: number;
  grid: Record<string, any>;
  viewMode: 'class' | 'teacher';
}) {
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 76,
          borderRadius: 2,
          background: 'grey.50',
          color: 'grey.600',
          fontWeight: 700,
          fontSize: 14,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {period}
      </Box>
      {DAYS.map((_, dayIdx) => {
        const entry = grid[`${dayIdx + 1}-${period}`];
        return <Cell key={dayIdx} entry={entry} viewMode={viewMode} />;
      })}
    </>
  );
}

function Cell({ entry, viewMode }: { entry: any; viewMode: 'class' | 'teacher' }) {
  if (!entry) {
    return (
      <Box
        sx={{
          minHeight: 76,
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'grey.200',
          background: 'transparent',
        }}
      />
    );
  }

  const color = entry.subject_color || '#6366f1';
  const subText = viewMode === 'class' ? entry.teacher_name : entry.class_name;

  return (
    <Box
      sx={{
        minHeight: 76,
        borderRadius: 2,
        position: 'relative',
        background: `${color}10`,
        border: `1px solid ${color}30`,
        overflow: 'hidden',
        padding: '10px 12px',
        cursor: 'default',
        transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: `0 6px 14px -6px ${color}60`,
          background: `${color}18`,
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          insetBlockStart: 0,
          insetBlockEnd: 0,
          insetInlineStart: 0,
          width: 3,
          background: color,
        }}
      />
      <Typography sx={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3, mb: 0.25 }}>
        {entry.subject_name}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'grey.700', lineHeight: 1.3 }} noWrap>
        {subText}
      </Typography>
    </Box>
  );
}

function GridHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 1.25,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'grey.500',
      }}
    >
      {children}
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
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField fullWidth label={t('timetable.name')} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField fullWidth label={t('timetable.year')} value={form.academic_year}
            onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)} disabled={!form.name}>
          {t('data.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
