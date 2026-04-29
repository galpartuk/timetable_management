import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select,
  Stack, Avatar,
} from '@mui/material';
import { Add, Edit, Delete, UploadFile, People as PeopleIcon } from '@mui/icons-material';
import {
  getTeachers, createTeacher, updateTeacher, deleteTeacher,
  getSubjects, createSubject, updateSubject, deleteSubject,
  getClasses, getAssignments, uploadDaysOff,
} from '../../api/client';

const DAY_OPTIONS = [
  { value: 1, key: 'sunday' },
  { value: 2, key: 'monday' },
  { value: 3, key: 'tuesday' },
  { value: 4, key: 'wednesday' },
  { value: 5, key: 'thursday' },
];

type TabKey = 'teachers' | 'subjects' | 'classes' | 'assignments';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'teachers', labelKey: 'data.teachers' },
  { key: 'subjects', labelKey: 'data.subjects' },
  { key: 'classes', labelKey: 'data.classes' },
  { key: 'assignments', labelKey: 'data.assignments' },
];

export default function DataEntry() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabKey>('teachers');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [editDialog, setEditDialog] = useState<{ type: string; data: any } | null>(null);
  const isRtl = i18n.language === 'he';

  const loadData = () => {
    getTeachers().then((r) => setTeachers(r.data.results ?? [])).catch(() => {});
    getSubjects().then((r) => setSubjects(r.data.results ?? [])).catch(() => {});
    getClasses().then((r) => setClasses(r.data.results ?? [])).catch(() => {});
    getAssignments().then((r) => setAssignments(r.data.results ?? [])).catch(() => {});
  };

  useEffect(loadData, []);

  const handleSaveTeacher = async (data: any) => {
    if (data.id) await updateTeacher(data.id, data);
    else await createTeacher({ ...data, school: 1 });
    setEditDialog(null);
    loadData();
  };

  const handleSaveSubject = async (data: any) => {
    if (data.id) await updateSubject(data.id, data);
    else await createSubject({ ...data, school: 1 });
    setEditDialog(null);
    loadData();
  };

  const handleQuickDayOff = async (teacher: any, dayOff: number | null) => {
    await updateTeacher(teacher.id, { ...teacher, day_off: dayOff });
    loadData();
  };

  const handleUploadDaysOff = async (file: File) => {
    try {
      const res = await uploadDaysOff(file, 1);
      const errs = res.data.errors ?? [];
      const msg = `${res.data.teachers_updated ?? 0} ${t('daysOff.updated')}`
        + (errs.length ? `\n${t('daysOff.errors')}:\n${errs.join('\n')}` : '');
      alert(msg);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.error ?? String(e));
    }
  };

  const handleDeleteTeacher = async (id: number) => {
    if (confirm(t('data.confirmDelete'))) {
      await deleteTeacher(id);
      loadData();
    }
  };

  const handleDeleteSubject = async (id: number) => {
    if (confirm(t('data.confirmDelete'))) {
      await deleteSubject(id);
      loadData();
    }
  };

  const counts: Record<TabKey, number> = {
    teachers: teachers.length,
    subjects: subjects.length,
    classes: classes.length,
    assignments: assignments.length,
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          {t('data.title')}
        </Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          {isRtl
            ? 'נהלו מורים, מקצועות, כיתות ושיבוצים במקום אחד.'
            : 'Manage teachers, subjects, classes, and assignments in one place.'}
        </Typography>
      </Box>

      {/* Pill tabs */}
      <Box
        sx={{
          display: 'inline-flex',
          gap: 0.5,
          padding: 0.5,
          background: 'grey.100',
          borderRadius: 3,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tabDef) => {
          const active = tab === tabDef.key;
          return (
            <Box
              key={tabDef.key}
              role="tab"
              tabIndex={0}
              onClick={() => setTab(tabDef.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTab(tabDef.key); }}
              sx={{
                cursor: 'pointer',
                userSelect: 'none',
                px: 2,
                py: 1,
                borderRadius: 2.5,
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'grey.900' : 'grey.600',
                background: active ? '#fff' : 'transparent',
                boxShadow: active
                  ? '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.06)'
                  : 'none',
                transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                '&:hover': { color: 'grey.900' },
              }}
            >
              {t(tabDef.labelKey)}
              <Box
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  background: active ? 'primary.main' : 'grey.200',
                  color: active ? '#fff' : 'grey.600',
                  minWidth: 20,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {counts[tabDef.key]}
              </Box>
            </Box>
          );
        })}
      </Box>

      {tab === 'teachers' && (
        <>
          <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setEditDialog({
                type: 'teacher',
                data: { first_name: '', last_name: '', email: '', phone: '', max_weekly_hours: 40, day_off: null },
              })}
            >
              {t('data.add')} {t('data.teachers')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              component="label"
            >
              {t('daysOff.import')}
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadDaysOff(f);
                  e.target.value = '';
                }}
              />
            </Button>
          </Stack>
          <Card>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('teacher.firstName')}</TableCell>
                    <TableCell>{t('teacher.lastName')}</TableCell>
                    <TableCell>{t('teacher.email')}</TableCell>
                    <TableCell>{t('teacher.phone')}</TableCell>
                    <TableCell>{t('teacher.maxHours')}</TableCell>
                    <TableCell>{t('teacher.dayOff')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                          <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                            {(teacher.first_name?.[0] || '?').toUpperCase()}
                          </Avatar>
                          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                            {teacher.first_name}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>{teacher.last_name}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: 'grey.600' }}>{teacher.email}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: 'grey.600', fontVariantNumeric: 'tabular-nums' }}>
                          {teacher.phone}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography className="tabular-nums" sx={{ fontWeight: 600 }}>
                          {teacher.max_weekly_hours}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={teacher.day_off ?? ''}
                          displayEmpty
                          onChange={(e) => handleQuickDayOff(teacher, e.target.value === '' ? null : Number(e.target.value))}
                          sx={{ minWidth: 130 }}
                        >
                          <MenuItem value="">—</MenuItem>
                          {DAY_OPTIONS.map((d) => (
                            <MenuItem key={d.value} value={d.value}>{t(`days.${d.key}`)}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <IconButton size="small" onClick={() => setEditDialog({ type: 'teacher', data: teacher })}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteTeacher(teacher.id)} sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {teachers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ borderBottom: 0 }}>
                        <EmptyTable
                          icon={<PeopleIcon />}
                          title={t('data.noData')}
                          hint={isRtl ? 'הוסיפו מורה ראשון או ייבאו מאקסל' : 'Add your first teacher or import from Excel'}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}

      {tab === 'subjects' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setEditDialog({ type: 'subject', data: { name_he: '', name_en: '', color: '#4A90D9' } })}
            >
              {t('data.add')} {t('data.subjects')}
            </Button>
          </Box>
          <Card>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('subject.nameHe')}</TableCell>
                    <TableCell>{t('subject.nameEn')}</TableCell>
                    <TableCell>{t('subject.color')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                          <Box
                            sx={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: subject.color,
                              boxShadow: `0 0 0 3px ${subject.color}25`,
                            }}
                          />
                          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{subject.name_he}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: 'grey.600' }}>{subject.name_en}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 1,
                            px: 1, py: 0.5, borderRadius: 1.5,
                            background: 'grey.50', border: '1px solid', borderColor: 'divider',
                          }}
                        >
                          <Box sx={{ width: 14, height: 14, borderRadius: 0.75, bgcolor: subject.color }} />
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'grey.600' }}>
                            {subject.color}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <IconButton size="small" onClick={() => setEditDialog({ type: 'subject', data: subject })}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteSubject(subject.id)} sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {subjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ borderBottom: 0 }}>
                        <EmptyTable
                          title={t('data.noData')}
                          hint={isRtl ? 'הוסיפו מקצוע ראשון' : 'Add your first subject'}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}

      {tab === 'classes' && (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('class.grade')}</TableCell>
                  <TableCell>{t('class.number')}</TableCell>
                  <TableCell>{t('class.type')}</TableCell>
                  <TableCell>{t('class.studentCount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {classes.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{cls.grade_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography className="tabular-nums">{cls.number}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: 'inline-block',
                          px: 1.25, py: 0.25,
                          borderRadius: 1.25,
                          background: 'grey.100',
                          color: 'grey.700',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {cls.class_type}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography className="tabular-nums" sx={{ fontWeight: 600 }}>{cls.student_count}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {classes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ borderBottom: 0 }}>
                      <EmptyTable title={t('data.noData')} hint={isRtl ? 'הכיתות יופיעו כאן' : 'Classes will appear here'} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {tab === 'assignments' && (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('assignment.teacher')}</TableCell>
                  <TableCell>{t('assignment.subject')}</TableCell>
                  <TableCell>{t('assignment.class')}</TableCell>
                  <TableCell>{t('assignment.weeklyHours')}</TableCell>
                  <TableCell>{t('assignment.notes')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{a.teacher_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 14 }}>{a.subject_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 14 }}>{a.class_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography className="tabular-nums" sx={{ fontWeight: 600 }}>{a.weekly_hours}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.600' }}>{a.notes}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                      <EmptyTable title={t('data.noData')} hint={isRtl ? 'השיבוצים יופיעו כאן' : 'Assignments will appear here'} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {editDialog?.type === 'teacher' && (
        <TeacherDialog
          data={editDialog.data}
          onSave={handleSaveTeacher}
          onClose={() => setEditDialog(null)}
        />
      )}
      {editDialog?.type === 'subject' && (
        <SubjectDialog
          data={editDialog.data}
          onSave={handleSaveSubject}
          onClose={() => setEditDialog(null)}
        />
      )}
    </Box>
  );
}

function EmptyTable({ icon, title, hint }: { icon?: ReactElement; title: string; hint?: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 6 }}>
      <Box
        sx={{
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'grey.50',
          color: 'grey.400',
          border: '1px dashed',
          borderColor: 'grey.200',
          mb: 1.5,
        }}
      >
        {icon || <PeopleIcon fontSize="small" />}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'grey.700' }}>{title}</Typography>
      {hint && <Typography variant="caption" sx={{ color: 'grey.500', mt: 0.5 }}>{hint}</Typography>}
    </Box>
  );
}

function TeacherDialog({ data, onSave, onClose }: { data: any; onSave: (d: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(data);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data.id ? t('data.edit') : t('data.add')} {t('data.teachers')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('teacher.firstName')} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <TextField fullWidth label={t('teacher.lastName')} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </Stack>
          <TextField fullWidth label={t('teacher.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('teacher.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextField fullWidth type="number" label={t('teacher.maxHours')} value={form.max_weekly_hours} onChange={(e) => setForm({ ...form, max_weekly_hours: parseInt(e.target.value) })} />
          </Stack>
          <TextField
            fullWidth select label={t('teacher.dayOff')}
            value={form.day_off ?? ''}
            onChange={(e) => setForm({ ...form, day_off: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <MenuItem value="">—</MenuItem>
            {DAY_OPTIONS.map((d) => (
              <MenuItem key={d.value} value={d.value}>{t(`days.${d.key}`)}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function SubjectDialog({ data, onSave, onClose }: { data: any; onSave: (d: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(data);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data.id ? t('data.edit') : t('data.add')} {t('data.subjects')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField fullWidth label={t('subject.nameHe')} value={form.name_he} onChange={(e) => setForm({ ...form, name_he: e.target.value })} />
          <TextField fullWidth label={t('subject.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
              {t('subject.color')}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                component="input"
                type="color"
                value={form.color}
                onChange={(e: any) => setForm({ ...form, color: e.target.value })}
                sx={{
                  width: 56, height: 40, padding: 0, border: '1px solid', borderColor: 'divider',
                  borderRadius: 1.5, cursor: 'pointer', background: 'transparent',
                }}
              />
              <TextField
                size="small"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                sx={{ flex: 1, '& input': { fontFamily: 'monospace' } }}
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
