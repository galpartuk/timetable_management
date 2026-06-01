import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete, Box, Card, CardContent, Grid, Typography, Button, Chip, Stack, TextField,
} from '@mui/material';
import {
  People as TeachersIcon,
  MenuBook as SubjectsIcon,
  Class as ClassesIcon,
  Assignment as AssignIcon,
  Upload as UploadIcon,
  CalendarMonth as TimetableIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  AutoAwesome as SparkleIcon,
  Visibility as ViewAsIcon,
} from '@mui/icons-material';
import {
  getTeachers, getSubjects, getClasses, getAssignments, getTimetables,
  getTimetableQuality, type TimetableQuality,
} from '../../api/client';

type StatTone = 'indigo' | 'emerald' | 'amber' | 'rose';

const TONE_STYLES: Record<StatTone, { fg: string; bg: string; ring: string }> = {
  indigo:  { fg: '#4f46e5', bg: 'rgba(79, 70, 229, 0.10)',  ring: 'rgba(79, 70, 229, 0.18)'  },
  emerald: { fg: '#059669', bg: 'rgba(16, 185, 129, 0.10)', ring: 'rgba(16, 185, 129, 0.18)' },
  amber:   { fg: '#d97706', bg: 'rgba(245, 158, 11, 0.12)', ring: 'rgba(245, 158, 11, 0.20)' },
  rose:    { fg: '#e11d48', bg: 'rgba(244, 63, 94, 0.10)',  ring: 'rgba(244, 63, 94, 0.18)'  },
};

function KpiBadge({ label, value, tone }: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad';
}) {
  const palette = {
    good: { bg: 'rgba(16,185,129,0.10)', fg: '#047857' },
    warn: { bg: 'rgba(245,158,11,0.10)', fg: '#b45309' },
    bad: { bg: 'rgba(244,63,94,0.10)', fg: '#be123c' },
  }[tone];
  return (
    <Box sx={{
      px: 1.5, py: 0.75, borderRadius: 2,
      background: palette.bg, color: palette.fg,
      minWidth: 96,
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, opacity: 0.85, lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1, mt: 0.25 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, classes: 0, assignments: 0 });
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [timetables, setTimetables] = useState<any[]>([]);
  const [latestQuality, setLatestQuality] = useState<TimetableQuality | null>(null);
  const isRtl = i18n.language === 'he';
  const ChevronEnd = isRtl ? ArrowBackIcon : ArrowForwardIcon;

  useEffect(() => {
    // Each fetch updates its own slice; previously they were Promise.all'd
    // with `.catch(() => ({ data: { count: 0 } }))`, which meant a single
    // transient timeout (e.g. during a heavy solver write) reset every counter
    // to zero. With WAL mode this is rare, but keeping the previous value on
    // failure means the dashboard never lies about the data we already know.
    const SENTINEL = -1;
    const setCount = (key: keyof typeof stats, n: number) => {
      if (n < 0) return; // failure — leave the stale value alone
      setStats((s) => ({ ...s, [key]: n }));
    };
    getTeachers().then((r) => {
      setCount('teachers', r.data.count ?? r.data.results?.length ?? 0);
      setTeachersList(r.data.results ?? []);
    }).catch(() => setCount('teachers', SENTINEL));
    getSubjects()
      .then((r) => setCount('subjects', r.data.count ?? r.data.results?.length ?? 0))
      .catch(() => setCount('subjects', SENTINEL));
    getClasses().then((r) => {
      setCount('classes', r.data.count ?? r.data.results?.length ?? 0);
      setClassesList(r.data.results ?? []);
    }).catch(() => setCount('classes', SENTINEL));
    getAssignments()
      .then((r) => setCount('assignments', r.data.count ?? r.data.results?.length ?? 0))
      .catch(() => setCount('assignments', SENTINEL));
    getTimetables()
      .then((r) => {
        const list = r.data.results ?? [];
        setTimetables(list);
        const latest = list.find((x: any) => x.status === 'completed');
        if (latest) {
          getTimetableQuality(latest.id)
            .then((r2) => setLatestQuality(r2.data))
            .catch(() => setLatestQuality(null));
        }
      })
      .catch(() => {});
  }, []);

  const statCards: { label: string; value: number; icon: ReactElement; tone: StatTone }[] = [
    { label: t('dashboard.teachers'),    value: stats.teachers,    icon: <TeachersIcon />, tone: 'indigo'  },
    { label: t('dashboard.subjects'),    value: stats.subjects,    icon: <SubjectsIcon />, tone: 'emerald' },
    { label: t('dashboard.classes'),     value: stats.classes,     icon: <ClassesIcon />,  tone: 'amber'   },
    { label: t('dashboard.assignments'), value: stats.assignments, icon: <AssignIcon />,   tone: 'rose'    },
  ];

  const statusColors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
    draft: 'default',
    generating: 'primary',
    completed: 'success',
    failed: 'error',
    published: 'warning',
  };

  const today = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>
          {today}
        </Typography>
        <Typography variant="h2" sx={{ mb: 1 }}>
          {t('dashboard.title')}
        </Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 15 }}>
          {isRtl
            ? 'סקירה מהירה של המצב הנוכחי, פעולות מומלצות ומערכות שעות אחרונות.'
            : 'A quick overview of current state, suggested actions, and recent timetables.'}
        </Typography>
      </Box>

      {/* Stat cards — bento grid */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {statCards.map((card) => {
          const tone = TONE_STYLES[card.tone];
          return (
            <Grid size={{ xs: 6, md: 3 }} key={card.label}>
              <Card
                sx={{
                  height: '100%',
                  cursor: 'default',
                  '&:hover': { boxShadow: 'var(--shadow-md)', transform: 'translateY(-2px)' },
                }}
              >
                <CardContent>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: tone.fg,
                      background: tone.bg,
                      boxShadow: `inset 0 0 0 1px ${tone.ring}`,
                      mb: 2.5,
                    }}
                  >
                    {card.icon}
                  </Box>
                  <Typography
                    className="tabular-nums"
                    sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', mb: 0.5 }}
                  >
                    {card.value}
                  </Typography>
                  <Typography sx={{ color: 'grey.600', fontSize: 13, fontWeight: 500 }}>
                    {card.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Quality KPI strip for the most-recent completed timetable */}
      {latestQuality && (
        <Card sx={{ mb: 3, p: 0 }}>
          <CardContent>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'grey.500', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  איכות מערכת אחרונה
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.25 }}>
                  {latestQuality.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                  {latestQuality.totals.entries} שיעורים · {latestQuality.teachers.length} מורים · {latestQuality.classes.length} כיתות
                </Typography>
              </Box>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <KpiBadge
                  label="חלונות מורים"
                  value={latestQuality.totals.total_teacher_windows}
                  tone={latestQuality.totals.total_teacher_windows < 30 ? 'good' : latestQuality.totals.total_teacher_windows < 100 ? 'warn' : 'bad'}
                />
                <KpiBadge
                  label="חלונות ארוכים"
                  value={latestQuality.totals.total_long_windows}
                  tone={latestQuality.totals.total_long_windows === 0 ? 'good' : 'bad'}
                />
                <KpiBadge
                  label="חלונות כיתות"
                  value={latestQuality.totals.total_class_windows}
                  tone={latestQuality.totals.total_class_windows < 10 ? 'good' : latestQuality.totals.total_class_windows < 50 ? 'warn' : 'bad'}
                />
                <KpiBadge
                  label="אחרי 8"
                  value={latestQuality.totals.late_period_lessons}
                  tone="warn"
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate('/manage')}
                >
                  פירוט מלא
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* View-as shortcut — mirrors mobile's view-as chip. Pick any
          teacher or class and jump to /timetable already filtered. */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' } }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 200 }}>
              <ViewAsIcon sx={{ color: 'primary.main', fontSize: 22 }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                  {isRtl ? 'צפייה במערכת של' : 'View timetable of'}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'grey.500' }}>
                  {isRtl ? 'בחרו מורה או כיתה כדי לפתוח את המערכת המסוננת' : 'Pick a teacher or class to open a filtered timetable'}
                </Typography>
              </Box>
            </Stack>
            <Autocomplete
              sx={{ flex: 1, minWidth: 220 }}
              size="small"
              options={teachersList}
              getOptionLabel={(t: any) => (t.full_name ?? `${t.first_name ?? ''} ${t.last_name ?? ''}`).trim()}
              renderInput={(params) => (
                <TextField {...params} label={isRtl ? 'מורה' : 'Teacher'} placeholder={isRtl ? 'חיפוש מורה' : 'Search teacher'} />
              )}
              onChange={(_, v: any) => {
                if (v?.id) navigate(`/timetable?teacher=${v.id}`);
              }}
            />
            <Autocomplete
              sx={{ flex: 1, minWidth: 220 }}
              size="small"
              options={classesList}
              getOptionLabel={(c: any) => c.display_name ?? c.name ?? ''}
              renderInput={(params) => (
                <TextField {...params} label={isRtl ? 'כיתה' : 'Class'} placeholder={isRtl ? 'חיפוש כיתה' : 'Search class'} />
              )}
              onChange={(_, v: any) => {
                if (v?.id) navigate(`/timetable?class=${v.id}`);
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Bento: featured CTA + recent + tip */}
      <Grid container spacing={2.5}>
        {/* Featured: Generate timetable CTA — wide hero card */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)',
              color: '#fff',
              border: 'none',
              minHeight: 240,
            }}
          >
            {/* Decorative blur shapes */}
            <Box
              sx={{
                position: 'absolute', insetBlockStart: -60, insetInlineEnd: -40,
                width: 240, height: 240, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)',
                filter: 'blur(20px)',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute', insetBlockEnd: -40, insetInlineStart: -20,
                width: 180, height: 180, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <CardContent sx={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', p: { xs: 3, md: 4 } }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
                <SparkleIcon sx={{ fontSize: 18, opacity: 0.9 }} />
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.85)', letterSpacing: '0.08em' }}>
                  {t('dashboard.quickActions')}
                </Typography>
              </Stack>

              <Typography variant="h3" sx={{ color: '#fff', mb: 1.5, maxWidth: 480 }}>
                {isRtl
                  ? 'מוכנים ליצור את מערכת השעות?'
                  : 'Ready to build your timetable?'}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.85)', mb: 'auto', maxWidth: 520, fontSize: 14 }}>
                {isRtl
                  ? 'ייבאו נתונים מאקסל או הוסיפו ידנית, ולאחר מכן לחצו על יצירה אוטומטית.'
                  : 'Import data from Excel or add manually, then auto-generate the schedule.'}
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate('/timetable')}
                  endIcon={<ChevronEnd />}
                  sx={{
                    background: '#fff',
                    color: 'primary.dark',
                    fontWeight: 700,
                    '&:hover': {
                      background: '#fff',
                      boxShadow: '0 12px 24px -8px rgba(0,0,0,0.25)',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  {t('dashboard.generateTimetable')}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => navigate('/import')}
                  startIcon={<UploadIcon />}
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.4)',
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                    '&:hover': {
                      background: 'rgba(255,255,255,0.18)',
                      borderColor: 'rgba(255,255,255,0.7)',
                    },
                  }}
                >
                  {t('dashboard.importExcel')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent timetables */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%', minHeight: 240 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h5" sx={{ fontSize: 16 }}>
                  {t('dashboard.recentTimetables')}
                </Typography>
                <Button
                  size="small"
                  endIcon={<ChevronEnd fontSize="small" />}
                  onClick={() => navigate('/timetable')}
                  sx={{ color: 'primary.main' }}
                >
                  {isRtl ? 'הצג הכול' : 'View all'}
                </Button>
              </Box>

              {timetables.length === 0 ? (
                <EmptyHint
                  icon={<TimetableIcon sx={{ fontSize: 28 }} />}
                  title={t('dashboard.noTimetables')}
                  hint={isRtl ? 'יצירה ראשונה תופיע כאן' : 'Your first one will appear here'}
                />
              ) : (
                <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                  {timetables.slice(0, 5).map((tt: any) => (
                    <Box
                      key={tt.id}
                      onClick={() => navigate('/timetable')}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.5,
                        cursor: 'pointer',
                        borderRadius: 2,
                        px: 1,
                        mx: -1,
                        transition: 'background 160ms',
                        '&:hover': { background: 'grey.50' },
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                          {tt.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'grey.500' }}>
                          {tt.academic_year}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={t(`timetable.${tt.status}`)}
                        color={statusColors[tt.status] || 'default'}
                        variant={tt.status === 'completed' ? 'filled' : 'outlined'}
                      />
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function EmptyHint({ icon, title, hint }: { icon: ReactElement; title: string; hint: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 4,
        color: 'grey.500',
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'grey.50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'grey.400',
          mb: 1.5,
          border: '1px dashed',
          borderColor: 'grey.200',
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'grey.700' }}>{title}</Typography>
      <Typography variant="caption" sx={{ color: 'grey.500', mt: 0.5 }}>{hint}</Typography>
    </Box>
  );
}
