import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAiAssistantContext } from '../../components/AiAssistant';
import {
  Box, Typography, Card, CardContent, Button, ToggleButtonGroup,
  ToggleButton, MenuItem, TextField, CircularProgress, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
} from '@mui/material';
import { CalendarMonth, Add, AutoAwesome, DeleteOutlined, Print } from '@mui/icons-material';
import {
  getTimetables, createTimetable, generateTimetable,
  getTimetableByClass, getTimetableByTeacher,
  getClasses, getTeachers, deleteTimetable,
  getTimetableQuality, type TimetableQuality,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const teacherParam = searchParams.get('teacher');
  const classParam = searchParams.get('class');
  const timetableParam = searchParams.get('timetable');

  const [timetables, setTimetables] = useState<any[]>([]);
  const [selectedTT, setSelectedTT] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>(
    teacherParam ? 'teacher' : 'class'
  );
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [entries, setEntries] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [quality, setQuality] = useState<TimetableQuality | null>(null);
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    getTimetables().then((r) => {
      const list = r.data.results ?? [];
      setTimetables(list);
      // If the URL has ?timetable=ID, prefer it; otherwise pick the first.
      const target = timetableParam
        ? list.find((tt: any) => tt.id === Number(timetableParam))
        : list[0];
      if (target) setSelectedTT(target);
    }).catch(() => {});
    getClasses().then((r) => setClasses(r.data.results ?? [])).catch(() => {});
    getTeachers().then((r) => setTeachers(r.data.results ?? [])).catch(() => {});
  }, [timetableParam]);

  // Apply teacher/class param once timetable is loaded.
  useEffect(() => {
    if (!selectedTT) return;
    if (teacherParam) {
      setSelectedId(Number(teacherParam));
      setViewMode('teacher');
    } else if (classParam) {
      setSelectedId(Number(classParam));
      setViewMode('class');
    }
  }, [selectedTT, teacherParam, classParam]);
  void setSearchParams;

  useEffect(() => {
    if (!selectedTT) {
      setQuality(null);
      return;
    }
    getTimetableQuality(selectedTT.id)
      .then((r) => setQuality(r.data))
      .catch(() => setQuality(null));
  }, [selectedTT?.id]);

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

  // Find the quality info for the currently-selected teacher / class
  const selectedQuality = useMemo(() => {
    if (!quality || !selectedId) return null;
    if (viewMode === 'teacher') {
      return quality.teachers.find((t) => t.id === selectedId) || null;
    }
    return quality.classes.find((c) => c.id === selectedId) || null;
  }, [quality, selectedId, viewMode]);

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
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlined />}
            disabled={!selectedTT}
            onClick={async () => {
              if (!selectedTT) return;
              if (!confirm(`למחוק את "${selectedTT.name}"? הפעולה אינה הפיכה.`)) return;
              try {
                await deleteTimetable(selectedTT.id);
                const r = await getTimetables();
                const list = r.data.results ?? [];
                setTimetables(list);
                setSelectedTT(list[0] ?? null);
                setEntries([]);
              } catch (e: any) {
                setError(e.response?.data?.error || 'מחיקה נכשלה');
              }
            }}
          >
            מחק
          </Button>
          <Button
            variant="outlined"
            startIcon={<Print />}
            disabled={!selectedTT || !selectedId}
            onClick={() => window.print()}
            className="no-print"
          >
            הדפסה
          </Button>
          <Button
            variant="contained"
            startIcon={generating ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />}
            onClick={handleGenerate}
            disabled={generating || !selectedTT}
            className="no-print"
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

      {selectedTT && quality && (
        <QualitySummaryBar quality={quality} />
      )}

      {selectedTT && selectedId ? (
        <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', lg: 'row' } }}>
          <Card sx={{ flex: 1, minWidth: 0 }}>
            <CardContent sx={{ p: { xs: 1.5, md: 2.5 }, overflowX: 'auto' }}>
              <TimetableGrid grid={grid} viewMode={viewMode} entries={entries} />
            </CardContent>
          </Card>
          {selectedQuality && (
            <SelectionDetailCard
              quality={selectedQuality}
              viewMode={viewMode}
              entries={entries}
            />
          )}
        </Box>
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
  entries,
}: {
  grid: Record<string, any>;
  viewMode: 'class' | 'teacher';
  entries: any[];
}) {
  const { t } = useTranslation();

  // Pre-compute, for each day, the range of periods the selected owner
  // actually teaches/attends — so we can render empty cells *within*
  // that range as "windows" (חלונות) and cells outside it as plain idle.
  const dayBounds = useMemo(() => {
    const bounds: Record<number, { min: number; max: number } | null> = {};
    for (let day = 1; day <= 5; day++) {
      const periods = entries
        .filter((e: any) => e.day === day)
        .map((e: any) => e.period);
      bounds[day] = periods.length
        ? { min: Math.min(...periods), max: Math.max(...periods) }
        : null;
    }
    return bounds;
  }, [entries]);

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
          dayBounds={dayBounds}
        />
      ))}
    </Box>
  );
}

function PeriodRow({
  period,
  grid,
  viewMode,
  dayBounds,
}: {
  period: number;
  grid: Record<string, any>;
  viewMode: 'class' | 'teacher';
  dayBounds: Record<number, { min: number; max: number } | null>;
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
        const day = dayIdx + 1;
        const entry = grid[`${day}-${period}`];
        const bound = dayBounds[day];
        const isWindow =
          !entry && !!bound && period > bound.min && period < bound.max;
        return <Cell key={dayIdx} entry={entry} viewMode={viewMode} isWindow={isWindow} />;
      })}
    </>
  );
}

function Cell({ entry, viewMode, isWindow }: { entry: any; viewMode: 'class' | 'teacher'; isWindow?: boolean }) {
  if (!entry) {
    if (isWindow) {
      return (
        <Box
          sx={{
            minHeight: 76,
            borderRadius: 2,
            border: '1px dashed',
            borderColor: '#f59e0b',
            background: 'rgba(245, 158, 11, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#b45309',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          חלון
        </Box>
      );
    }
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

// ── Quality summary bar ──────────────────────────────────────────────────

function QualitySummaryBar({ quality }: { quality: TimetableQuality }) {
  const t = quality.totals;
  return (
    <Card sx={{ mb: 2.5 }}>
      <CardContent sx={{ py: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}
          sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'grey.700' }}>
              סיכום איכות המערכת
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'grey.500' }}>
              מערכת זו נוצרה תוך מזעור חלונות המורים והכיתות. ככל שהמספרים נמוכים יותר — המערכת איכותית יותר.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Stat
              label="שיעורים"
              value={t.entries}
              color="primary"
            />
            <Stat
              label="חלונות מורים"
              value={t.total_teacher_windows}
              tone={t.total_teacher_windows < 30 ? 'good' : t.total_teacher_windows < 100 ? 'warn' : 'bad'}
              hint={`${t.teachers_with_windows} מורים מושפעים`}
            />
            <Stat
              label="חלונות כיתות"
              value={t.total_class_windows}
              tone={t.total_class_windows < 10 ? 'good' : t.total_class_windows < 50 ? 'warn' : 'bad'}
              hint={`${t.classes_with_windows} כיתות מושפעות`}
            />
            <Stat
              label="שיעורים אחרי 8"
              value={t.late_period_lessons}
              tone="warn"
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone, hint, color }: {
  label: string;
  value: number;
  tone?: 'good' | 'warn' | 'bad';
  hint?: string;
  color?: 'primary' | 'default';
}) {
  const palette = {
    good: { bg: 'rgba(16, 185, 129, 0.10)', fg: '#047857' },
    warn: { bg: 'rgba(245, 158, 11, 0.10)', fg: '#b45309' },
    bad: { bg: 'rgba(244, 63, 94, 0.10)', fg: '#be123c' },
  }[tone || 'good'];
  const isPrimary = color === 'primary';
  return (
    <Box sx={{
      px: 1.5, py: 1,
      borderRadius: 2,
      background: isPrimary ? 'rgba(79,70,229,0.08)' : palette.bg,
      color: isPrimary ? 'primary.dark' : palette.fg,
      minWidth: 120,
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, opacity: 0.7, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1, mt: 0.25 }}>
        {value}
      </Typography>
      {hint && (
        <Typography sx={{ fontSize: 10, opacity: 0.7, mt: 0.25 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

// ── Per-entity detail panel (shown next to the timetable grid) ──────────

function SelectionDetailCard({ quality, viewMode, entries }: {
  quality: any;
  viewMode: 'class' | 'teacher';
  entries: any[];
}) {
  const totalLessons = entries.length;
  const dayLabels: Record<number, string> = { 1: 'ראשון', 2: 'שני', 3: 'שלישי', 4: 'רביעי', 5: 'חמישי' };

  // Per-day lesson counts and span
  const days = [1, 2, 3, 4, 5].map((d) => {
    const periods = entries.filter((e: any) => e.day === d).map((e: any) => e.period);
    const lessons = periods.length;
    const first = periods.length ? Math.min(...periods) : null;
    const last = periods.length ? Math.max(...periods) : null;
    const span = first && last ? last - first + 1 : 0;
    const windows = lessons > 0 ? Math.max(0, span - lessons) : 0;
    return { day: d, lessons, first, last, span, windows };
  });

  return (
    <Card sx={{ flex: '0 0 320px', alignSelf: 'flex-start' }}>
      <CardContent>
        <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 0.5 }}>
          {quality.name}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'grey.500', mb: 2 }}>
          {viewMode === 'teacher'
            ? `${totalLessons} שיעורים · ${quality.days_taught || 0} ימי הוראה`
            : `${totalLessons} שיעורים · ${days.filter((d) => d.lessons > 0).length} ימי לימוד`}
        </Typography>

        <Box sx={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2,
        }}>
          <Box sx={{ background: 'rgba(245,158,11,0.10)', borderRadius: 2, p: 1.25 }}>
            <Typography sx={{ fontSize: 10, color: '#b45309', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              חלונות
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#b45309', mt: 0.25 }}>
              {quality.windows}
            </Typography>
          </Box>
          <Box sx={{ background: 'rgba(79,70,229,0.08)', borderRadius: 2, p: 1.25 }}>
            <Typography sx={{ fontSize: 10, color: 'primary.dark', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              שיעורים
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'primary.dark', mt: 0.25 }}>
              {quality.lessons}
            </Typography>
          </Box>
        </Box>

        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'grey.700', mb: 1 }}>
          פירוט יומי
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {days.map((d) => (
            <Box
              key={d.day}
              sx={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', py: 0.5, px: 1, borderRadius: 1.5,
                background: d.lessons === 0 ? 'transparent' : 'grey.50',
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{dayLabels[d.day]}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {d.lessons === 0 ? (
                  <Chip size="small" label="חופש" sx={{ height: 18, fontSize: 10 }} />
                ) : (
                  <>
                    <Typography sx={{ fontSize: 11, color: 'grey.600' }}>
                      {d.lessons} שיעורים · שיעור {d.first}–{d.last}
                    </Typography>
                    {d.windows > 0 && (
                      <Chip size="small" label={`${d.windows} חלון`}
                            sx={{ height: 18, fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#b45309' }} />
                    )}
                  </>
                )}
              </Stack>
            </Box>
          ))}
        </Box>

        {viewMode === 'teacher' && quality.has_day_off && (
          <Box sx={{ mt: 2, p: 1.25, background: 'grey.50', borderRadius: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: 'grey.700' }}>
              יום חופש: {dayLabels[quality.day_off]}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
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
