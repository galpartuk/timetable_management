import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select,
  Stack, Avatar, Chip, Menu, Checkbox, Tooltip,
} from '@mui/material';
import { Add, Edit, Delete, UploadFile, People as PeopleIcon, LocalOffer as TagIcon, Groups } from '@mui/icons-material';
import {
  getTeachers, createTeacher, updateTeacher, deleteTeacher,
  getTeacherTags, createTeacherTag, updateTeacherTag, deleteTeacherTag,
  setTagMembers, bulkSetDayOff,
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

type TabKey = 'teachers' | 'tags' | 'subjects' | 'classes' | 'assignments';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'teachers', labelKey: 'data.teachers' },
  { key: 'tags', labelKey: 'data.tags' },
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
  const [tags, setTags] = useState<any[]>([]);
  const [editDialog, setEditDialog] = useState<{ type: string; data: any } | null>(null);
  const isRtl = i18n.language === 'he';

  const loadData = () => {
    getTeachers().then((r) => setTeachers(r.data.results ?? [])).catch(() => {});
    getSubjects().then((r) => setSubjects(r.data.results ?? [])).catch(() => {});
    getClasses().then((r) => setClasses(r.data.results ?? [])).catch(() => {});
    getAssignments().then((r) => setAssignments(r.data.results ?? [])).catch(() => {});
    getTeacherTags().then((r: any) => setTags(r.data.results ?? [])).catch(() => {});
  };

  useEffect(loadData, []);

  const handleSaveTeacher = async (data: any) => {
    if (data.id) await updateTeacher(data.id, data);
    else await createTeacher({ ...data, school: 1 });
    setEditDialog(null);
    loadData();
  };

  // Quick toggle: add/remove a tag on a teacher from the row chip ×.
  const handleToggleTag = async (teacher: any, tagId: number) => {
    const current: number[] = teacher.tags ?? [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    await updateTeacher(teacher.id, { ...teacher, tags: next });
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

  const handleSaveTag = async (data: any) => {
    if (data.id) await updateTeacherTag(data.id, data);
    else await createTeacherTag({ name: data.name, color: data.color, kind: 'custom', school: 1 });
    setEditDialog(null);
    loadData();
  };

  const handleDeleteTag = async (id: number) => {
    if (confirm(t('data.confirmDelete'))) {
      await deleteTeacherTag(id);
      loadData();
    }
  };

  // Set (or clear) the day off for every teacher carrying this tag.
  const handleTagDayOff = async (tag: any, dayOff: number | null) => {
    const res = await bulkSetDayOff({ tag_id: tag.id, day_off: dayOff });
    alert(`${res.data.updated ?? 0} ${t('daysOff.updated')}`);
    loadData();
  };

  const handleSaveMembers = async (tagId: number, teacherIds: number[]) => {
    await setTagMembers(tagId, teacherIds);
    setEditDialog(null);
    loadData();
  };

  const counts: Record<TabKey, number> = {
    teachers: teachers.length,
    tags: tags.length,
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
                    <TableCell>{isRtl ? 'תגיות' : 'Tags'}</TableCell>
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
                        <TagsCell
                          teacher={teacher}
                          allTags={tags}
                          onToggle={(tagId) => handleToggleTag(teacher, tagId)}
                        />
                      </TableCell>
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
                      <TableCell colSpan={8} sx={{ borderBottom: 0 }}>
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

      {tab === 'tags' && (
        <TagsTab
          tags={tags}
          isRtl={isRtl}
          onAdd={() => setEditDialog({ type: 'tag', data: { name: '', color: '#6366F1' } })}
          onEdit={(tag) => setEditDialog({ type: 'tag', data: tag })}
          onDelete={handleDeleteTag}
          onDayOff={handleTagDayOff}
          onManageMembers={(tag) => setEditDialog({ type: 'tagMembers', data: tag })}
        />
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
      {editDialog?.type === 'tag' && (
        <TagDialog
          data={editDialog.data}
          onSave={handleSaveTag}
          onClose={() => setEditDialog(null)}
        />
      )}
      {editDialog?.type === 'tagMembers' && (
        <TagMembersDialog
          tag={editDialog.data}
          teachers={teachers}
          onSave={(ids) => handleSaveMembers(editDialog.data.id, ids)}
          onClose={() => setEditDialog(null)}
        />
      )}
    </Box>
  );
}

const TAG_KIND_META: Record<string, { he: string; en: string; color: string }> = {
  department: { he: 'מחלקה', en: 'Department', color: '#2563EB' },
  coordinator: { he: 'ריכוז', en: 'Coordinator', color: '#7C3AED' },
  custom: { he: 'מותאם', en: 'Custom', color: '#64748B' },
};

function TagsTab({ tags, isRtl, onAdd, onEdit, onDelete, onDayOff, onManageMembers }: {
  tags: any[];
  isRtl: boolean;
  onAdd: () => void;
  onEdit: (tag: any) => void;
  onDelete: (id: number) => void;
  onDayOff: (tag: any, dayOff: number | null) => void;
  onManageMembers: (tag: any) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<Add />} onClick={onAdd}>
          {t('data.add')} {isRtl ? 'תגית' : 'Tag'}
        </Button>
        <Typography sx={{ color: 'grey.600', fontSize: 13 }}>
          {isRtl
            ? 'מחלקות וריכוזים נוצרים אוטומטית מהייבוא וניתנים לעריכה. בחרו יום חופש לכל חברי תגית בלחיצה אחת.'
            : 'Departments and coordinators are auto-created on import and editable. Set a day off for all members of a tag in one click.'}
        </Typography>
      </Stack>
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{isRtl ? 'תגית' : 'Tag'}</TableCell>
                <TableCell>{isRtl ? 'סוג' : 'Kind'}</TableCell>
                <TableCell>{isRtl ? 'חברים' : 'Members'}</TableCell>
                <TableCell>{isRtl ? 'יום חופש לכל החברים' : 'Day off for all members'}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {tags.map((tag) => {
                const meta = TAG_KIND_META[tag.kind] ?? TAG_KIND_META.custom;
                return (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={tag.name}
                        sx={{ bgcolor: tag.color + '22', color: tag.color, fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: 'inline-block', px: 1, py: 0.25, borderRadius: 1,
                          fontSize: 11, fontWeight: 700,
                          bgcolor: meta.color + '18', color: meta.color,
                        }}
                      >
                        {isRtl ? meta.he : meta.en}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography className="tabular-nums" sx={{ fontWeight: 600 }}>
                        {tag.teacher_count ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value=""
                        displayEmpty
                        onChange={(e) => onDayOff(tag, e.target.value === '' ? null : Number(e.target.value))}
                        sx={{ minWidth: 150 }}
                        renderValue={() => (isRtl ? 'בחרו יום…' : 'Pick a day…')}
                      >
                        <MenuItem value="">{isRtl ? 'ללא יום חופש' : 'Clear day off'}</MenuItem>
                        {DAY_OPTIONS.map((d) => (
                          <MenuItem key={d.value} value={d.value}>{t(`days.${d.key}`)}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title={isRtl ? 'נהל חברים' : 'Manage members'}>
                          <IconButton size="small" onClick={() => onManageMembers(tag)}>
                            <Groups fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => onEdit(tag)}>
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => onDelete(tag.id)}
                          sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tags.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                    <EmptyTable
                      icon={<TagIcon />}
                      title={isRtl ? 'אין תגיות עדיין' : 'No tags yet'}
                      hint={isRtl ? 'ייבאו מאקסל כדי ליצור מחלקות אוטומטית, או הוסיפו תגית' : 'Import from Excel to auto-create departments, or add a tag'}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
}

function TagDialog({ data, onSave, onClose }: { data: any; onSave: (d: any) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const [form, setForm] = useState(data);
  const isAuto = form.kind && form.kind !== 'custom';
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{data.id ? t('data.edit') : t('data.add')} {isRtl ? 'תגית' : 'Tag'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            fullWidth label={isRtl ? 'שם' : 'Name'} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {isAuto && (
            <Typography variant="caption" sx={{ color: 'grey.600' }}>
              {isRtl
                ? 'תגית זו נוצרה אוטומטית מהייבוא. שינוי השם או הצבע יישמרו, אך הסוג יישאר.'
                : 'This tag was auto-created on import. Renaming/recoloring is saved; its kind stays.'}
            </Typography>
          )}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
              {isRtl ? 'צבע' : 'Color'}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                component="input" type="color" value={form.color}
                onChange={(e: any) => setForm({ ...form, color: e.target.value })}
                sx={{ width: 56, height: 40, padding: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, cursor: 'pointer', background: 'transparent' }}
              />
              <TextField
                size="small" value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                sx={{ flex: 1, '& input': { fontFamily: 'monospace' } }}
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)} disabled={!form.name?.trim()}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function TagMembersDialog({ tag, teachers, onSave, onClose }: {
  tag: any; teachers: any[]; onSave: (ids: number[]) => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const [selected, setSelected] = useState<number[]>(
    () => teachers.filter((tc) => (tc.tags ?? []).includes(tag.id)).map((tc) => tc.id),
  );
  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {isRtl ? 'חברי התגית' : 'Tag members'}: {tag.name}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={0.5}>
          {teachers.map((tc) => (
            <Box
              key={tc.id}
              onClick={() => toggle(tc.id)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
            >
              <Checkbox size="small" checked={selected.includes(tc.id)} />
              <Typography sx={{ fontSize: 14 }}>{tc.first_name} {tc.last_name}</Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(selected)}>{t('data.save')}</Button>
      </DialogActions>
    </Dialog>
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

function TagsCell({ teacher, allTags, onToggle }: {
  teacher: any;
  allTags: any[];
  onToggle: (tagId: number) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const assignedIds: number[] = teacher.tags ?? [];
  const assigned = allTags.filter((t) => assignedIds.includes(t.id));
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {assigned.map((tag) => (
        <Chip
          key={tag.id}
          size="small"
          label={tag.name}
          sx={{ bgcolor: tag.color + '22', color: tag.color, fontWeight: 600 }}
          onDelete={() => onToggle(tag.id)}
        />
      ))}
      <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: 'grey.500' }}>
        <TagIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {allTags.length === 0 && <MenuItem disabled>אין תגיות זמינות</MenuItem>}
        {allTags.map((tag) => {
          const on = assignedIds.includes(tag.id);
          return (
            <MenuItem key={tag.id} onClick={() => { onToggle(tag.id); setAnchor(null); }}>
              <Chip
                size="small"
                label={tag.name}
                sx={{ bgcolor: tag.color + '22', color: tag.color, fontWeight: 600, mr: 1 }}
              />
              {on ? '✓' : '+'}
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );
}
