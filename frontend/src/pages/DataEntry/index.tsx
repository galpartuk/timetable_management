import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Tabs, Tab, Card, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select,
} from '@mui/material';
import { Add, Edit, Delete, UploadFile } from '@mui/icons-material';
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function DataEntry() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [editDialog, setEditDialog] = useState<{ type: string; data: any } | null>(null);

  const loadData = () => {
    getTeachers().then((r) => setTeachers(r.data.results ?? [])).catch(() => {});
    getSubjects().then((r) => setSubjects(r.data.results ?? [])).catch(() => {});
    getClasses().then((r) => setClasses(r.data.results ?? [])).catch(() => {});
    getAssignments().then((r) => setAssignments(r.data.results ?? [])).catch(() => {});
  };

  useEffect(loadData, []);

  const handleSaveTeacher = async (data: any) => {
    if (data.id) {
      await updateTeacher(data.id, data);
    } else {
      await createTeacher({ ...data, school: 1 });
    }
    setEditDialog(null);
    loadData();
  };

  const handleSaveSubject = async (data: any) => {
    if (data.id) {
      await updateSubject(data.id, data);
    } else {
      await createSubject({ ...data, school: 1 });
    }
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

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        {t('data.title')}
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t('data.teachers')} />
        <Tab label={t('data.subjects')} />
        <Tab label={t('data.classes')} />
        <Tab label={t('data.assignments')} />
      </Tabs>

      {/* Teachers */}
      <TabPanel value={tab} index={0}>
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setEditDialog({ type: 'teacher', data: { first_name: '', last_name: '', email: '', phone: '', max_weekly_hours: 40, day_off: null } })}
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
        </Box>
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
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>{teacher.first_name}</TableCell>
                    <TableCell>{teacher.last_name}</TableCell>
                    <TableCell>{teacher.email}</TableCell>
                    <TableCell>{teacher.phone}</TableCell>
                    <TableCell>{teacher.max_weekly_hours}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={teacher.day_off ?? ''}
                        displayEmpty
                        onChange={(e) => handleQuickDayOff(teacher, e.target.value === '' ? null : Number(e.target.value))}
                        sx={{ minWidth: 110 }}
                      >
                        <MenuItem value="">—</MenuItem>
                        {DAY_OPTIONS.map((d) => (
                          <MenuItem key={d.value} value={d.value}>{t(`days.${d.key}`)}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditDialog({ type: 'teacher', data: teacher })}>
                        <Edit />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteTeacher(teacher.id)}>
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {teachers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">{t('data.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </TabPanel>

      {/* Subjects */}
      <TabPanel value={tab} index={1}>
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
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell>{subject.name_he}</TableCell>
                    <TableCell>{subject.name_en}</TableCell>
                    <TableCell>
                      <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: subject.color }} />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => setEditDialog({ type: 'subject', data: subject })}>
                        <Edit />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteSubject(subject.id)}>
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {subjects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">{t('data.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </TabPanel>

      {/* Classes */}
      <TabPanel value={tab} index={2}>
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
                    <TableCell>{cls.grade_name}</TableCell>
                    <TableCell>{cls.number}</TableCell>
                    <TableCell>{cls.class_type}</TableCell>
                    <TableCell>{cls.student_count}</TableCell>
                  </TableRow>
                ))}
                {classes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">{t('data.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </TabPanel>

      {/* Assignments */}
      <TabPanel value={tab} index={3}>
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
                    <TableCell>{a.teacher_name}</TableCell>
                    <TableCell>{a.subject_name}</TableCell>
                    <TableCell>{a.class_name}</TableCell>
                    <TableCell>{a.weekly_hours}</TableCell>
                    <TableCell>{a.notes}</TableCell>
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">{t('data.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </TabPanel>

      {/* Edit Dialog */}
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

function TeacherDialog({ data, onSave, onClose }: { data: any; onSave: (d: any) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(data);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data.id ? t('data.edit') : t('data.add')} {t('data.teachers')}</DialogTitle>
      <DialogContent>
        <TextField fullWidth label={t('teacher.firstName')} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} margin="normal" />
        <TextField fullWidth label={t('teacher.lastName')} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} margin="normal" />
        <TextField fullWidth label={t('teacher.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} margin="normal" />
        <TextField fullWidth label={t('teacher.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} margin="normal" />
        <TextField fullWidth type="number" label={t('teacher.maxHours')} value={form.max_weekly_hours} onChange={(e) => setForm({ ...form, max_weekly_hours: parseInt(e.target.value) })} margin="normal" />
        <TextField
          fullWidth select label={t('teacher.dayOff')}
          value={form.day_off ?? ''}
          onChange={(e) => setForm({ ...form, day_off: e.target.value === '' ? null : Number(e.target.value) })}
          margin="normal"
        >
          <MenuItem value="">—</MenuItem>
          {DAY_OPTIONS.map((d) => (
            <MenuItem key={d.value} value={d.value}>{t(`days.${d.key}`)}</MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('data.cancel')}</Button>
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
        <TextField fullWidth label={t('subject.nameHe')} value={form.name_he} onChange={(e) => setForm({ ...form, name_he: e.target.value })} margin="normal" />
        <TextField fullWidth label={t('subject.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} margin="normal" />
        <TextField fullWidth type="color" label={t('subject.color')} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} margin="normal" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
