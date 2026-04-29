import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box, Card, CardContent, Grid, Typography, Button, Chip,
} from '@mui/material';
import {
  People as TeachersIcon,
  MenuBook as SubjectsIcon,
  Class as ClassesIcon,
  Assignment as AssignIcon,
  Upload as UploadIcon,
  CalendarMonth as TimetableIcon,
} from '@mui/icons-material';
import { getTeachers, getSubjects, getClasses, getAssignments, getTimetables } from '../../api/client';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, classes: 0, assignments: 0 });
  const [timetables, setTimetables] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      getTeachers().catch(() => ({ data: { count: 0 } })),
      getSubjects().catch(() => ({ data: { count: 0 } })),
      getClasses().catch(() => ({ data: { count: 0 } })),
      getAssignments().catch(() => ({ data: { count: 0 } })),
      getTimetables().catch(() => ({ data: { results: [] } })),
    ]).then(([teachers, subjects, classes, assignments, tt]) => {
      setStats({
        teachers: teachers.data.count ?? teachers.data.results?.length ?? 0,
        subjects: subjects.data.count ?? subjects.data.results?.length ?? 0,
        classes: classes.data.count ?? classes.data.results?.length ?? 0,
        assignments: assignments.data.count ?? assignments.data.results?.length ?? 0,
      });
      setTimetables(tt.data.results ?? []);
    });
  }, []);

  const statCards = [
    { label: t('dashboard.teachers'), value: stats.teachers, icon: <TeachersIcon fontSize="large" />, color: '#1976d2' },
    { label: t('dashboard.subjects'), value: stats.subjects, icon: <SubjectsIcon fontSize="large" />, color: '#2e7d32' },
    { label: t('dashboard.classes'), value: stats.classes, icon: <ClassesIcon fontSize="large" />, color: '#ed6c02' },
    { label: t('dashboard.assignments'), value: stats.assignments, icon: <AssignIcon fontSize="large" />, color: '#9c27b0' },
  ];

  const statusColors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
    draft: 'default',
    generating: 'primary',
    completed: 'success',
    failed: 'error',
    published: 'warning',
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        {t('dashboard.title')}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((card) => (
          <Grid size={{ xs: 6, md: 3 }} key={card.label}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
                <Typography variant="h3" sx={{ fontWeight: 700 }}>{card.value}</Typography>
                <Typography color="text.secondary">{card.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('dashboard.quickActions')}</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<UploadIcon />}
                  onClick={() => navigate('/import')}
                >
                  {t('dashboard.importExcel')}
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<TimetableIcon />}
                  onClick={() => navigate('/timetable')}
                >
                  {t('dashboard.generateTimetable')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('dashboard.recentTimetables')}</Typography>
              {timetables.length === 0 ? (
                <Typography color="text.secondary">{t('dashboard.noTimetables')}</Typography>
              ) : (
                timetables.slice(0, 5).map((tt: any) => (
                  <Box key={tt.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                    <Typography>{tt.name}</Typography>
                    <Chip
                      size="small"
                      label={t(`timetable.${tt.status}`)}
                      color={statusColors[tt.status] || 'default'}
                    />
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
