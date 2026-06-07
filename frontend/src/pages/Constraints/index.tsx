import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Button, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Stack, Chip,
} from '@mui/material';
import { Add, Delete, Rule as RuleIcon, AddCircleOutlined } from '@mui/icons-material';
import {
  getConstraints, createConstraint, updateConstraint, deleteConstraint,
  getTeachers, getSubjects, getClasses, getTeacherTags,
} from '../../api/client';

type Field =
  | { kind: 'teacher'; required?: boolean; allowAll?: boolean }
  | { kind: 'subject'; required?: boolean; allowAll?: boolean }
  | { kind: 'class'; required?: boolean; allowAll?: boolean }
  | { kind: 'tag'; required?: boolean }
  | { kind: 'slots'; key: string; labelKey: string; labelEn: string }
  | { kind: 'days'; key: string; labelKey: string; labelEn: string }
  | { kind: 'param'; key: string; labelKey: string; labelEn: string; type: 'number' | 'periods' | 'day'; default: any };

const DAY_LABELS = [
  { v: 1, l: 'ראשון', lEn: 'Sunday' }, { v: 2, l: 'שני', lEn: 'Monday' }, { v: 3, l: 'שלישי', lEn: 'Tuesday' },
  { v: 4, l: 'רביעי', lEn: 'Wednesday' }, { v: 5, l: 'חמישי', lEn: 'Thursday' },
];
const dayLabel = (v: number, isRtl = true) =>
  (isRtl ? DAY_LABELS.find((d) => d.v === v)?.l : DAY_LABELS.find((d) => d.v === v)?.lEn) ?? String(v);

interface TypeSchema {
  value: string;
  labelHe: string;
  labelEn: string;
  description?: string;
  descriptionEn?: string;
  fields: Field[];
}

const TYPE_SCHEMAS: TypeSchema[] = [
  {
    value: 'max_daily_hours_class',
    labelHe: 'מקסימום שעות ביום לכיתה',
    labelEn: 'Max daily hours per class',
    description: 'הגבלת שיעורים יומיים לכל כיתה (או כיתה ספציפית).',
    descriptionEn: 'Limit daily lessons for every class (or a specific class).',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'שעות מקסימום', labelEn: 'Max hours', type: 'number', default: 8 },
    ],
  },
  {
    value: 'max_daily_hours_teacher',
    labelHe: 'מקסימום שעות ביום למורה',
    labelEn: 'Max daily hours per teacher',
    description: 'הגבלת שיעורים יומיים לכל מורה (או מורה ספציפי).',
    descriptionEn: 'Limit daily lessons for every teacher (or a specific teacher).',
    fields: [
      { kind: 'teacher', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'שעות מקסימום', labelEn: 'Max hours', type: 'number', default: 6 },
    ],
  },
  {
    value: 'consecutive_hours',
    labelHe: 'מקסימום שעות מקצוע ליום',
    labelEn: 'Max subject hours per day',
    description: 'כמה שיעורים של מקצוע יכולים להיות באותו יום באותה כיתה.',
    descriptionEn: 'How many lessons of a subject can occur on the same day in the same class.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'subject', allowAll: true },
      { kind: 'param', key: 'max_per_day', labelKey: 'מקס׳ ליום', labelEn: 'Max per day', type: 'number', default: 2 },
    ],
  },
  {
    value: 'consecutive_pair',
    labelHe: 'זוג שיעורים רצופים',
    labelEn: 'Consecutive lesson pairs',
    description: 'כופה שלפחות N שיעורים של (כיתה, מקצוע) יהיו רצופים בלוח. שימושי למתמטיקה ומעבדות.',
    descriptionEn: 'Forces at least N lessons of a (class, subject) to be consecutive. Useful for math and labs.',
    fields: [
      { kind: 'class', required: true },
      { kind: 'subject', required: true },
      { kind: 'param', key: 'min_pairs', labelKey: 'מינ׳ זוגות', labelEn: 'Min pairs', type: 'number', default: 1 },
    ],
  },
  {
    value: 'lunch_break',
    labelHe: 'הפסקת אוכל',
    labelEn: 'Lunch break',
    description: 'שעה אחת או יותר ביום שלא יוקצו לה שיעורים. לדוגמה: שעה 5.',
    descriptionEn: 'One or more periods per day with no lessons assigned. For example: period 5.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'param', key: 'periods', labelKey: 'שעות הפנויות (CSV)', labelEn: 'Free periods (CSV)', type: 'periods', default: '5' },
    ],
  },
  {
    value: 'no_last_period',
    labelHe: 'לא בשיעור אחרון',
    labelEn: 'Not in last period',
    description: 'אסור לשבץ שיעורים בשעה/שעות האחרונות של היום.',
    descriptionEn: 'Lessons may not be scheduled in the last period(s) of the day.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'subject', allowAll: true },
      { kind: 'teacher', allowAll: true },
      { kind: 'param', key: 'periods', labelKey: 'שעות אסורות (CSV)', labelEn: 'Forbidden periods (CSV)', type: 'periods', default: '10' },
    ],
  },
  {
    value: 'teacher_availability',
    labelHe: 'זמינות מורה',
    labelEn: 'Teacher availability',
    description: 'חסום זמנים ספציפיים בהם המורה לא יכול ללמד.',
    descriptionEn: 'Block specific times when the teacher cannot teach.',
    fields: [
      { kind: 'teacher', required: true },
      { kind: 'slots', key: 'unavailable', labelKey: 'שעות חסומות', labelEn: 'Blocked periods' },
    ],
  },
  {
    value: 'subject_day_blackout',
    labelHe: 'חסימת מקצוע ביום',
    labelEn: 'Subject day blackout',
    description: 'אסור לשבץ את המקצוע בימים שנבחרו (לכיתה ספציפית או לכולן).',
    descriptionEn: 'The subject may not be scheduled on the selected days (for a specific class or all).',
    fields: [
      { kind: 'subject', required: true },
      { kind: 'class', allowAll: true },
      { kind: 'days', key: 'days', labelKey: 'ימים חסומים', labelEn: 'Blocked days' },
    ],
  },
  {
    value: 'group_blocked_slot',
    labelHe: 'פגישת קבוצה (חסימת תגית)',
    labelEn: 'Group meeting (tag blackout)',
    description: 'חסום קבוצת מורים (תגית) ביום ושעות ספציפיים — מתאים לפגישות צוות שבועיות.',
    descriptionEn: 'Block a group of teachers (tag) on a specific day and periods - suitable for weekly staff meetings.',
    fields: [
      { kind: 'tag', required: true },
      { kind: 'param', key: 'day', labelKey: 'יום בשבוע', labelEn: 'Day of week', type: 'day', default: 3 },
      { kind: 'param', key: 'periods', labelKey: 'שעות (CSV)', labelEn: 'Periods (CSV)', type: 'periods', default: '1' },
    ],
  },
];

export default function ConstraintsPage() {
  const { t, i18n } = useTranslation();
  const [constraints, setConstraints] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);

  const loadData = () => {
    getConstraints().then((r: any) => setConstraints(r.data.results ?? [])).catch(() => {});
    getTeachers().then((r: any) => setTeachers(r.data.results ?? [])).catch(() => {});
    getSubjects().then((r: any) => setSubjects(r.data.results ?? [])).catch(() => {});
    getClasses().then((r: any) => setClasses(r.data.results ?? [])).catch(() => {});
    getTeacherTags().then((r: any) => setTags(r.data.results ?? [])).catch(() => {});
  };

  useEffect(loadData, []);

  const handleToggle = async (constraint: any) => {
    await updateConstraint(constraint.id, { ...constraint, is_active: !constraint.is_active });
    loadData();
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('data.confirmDelete'))) {
      await deleteConstraint(id);
      loadData();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            {t('constraints.title')}
          </Typography>
          <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
            {isRtl
              ? 'הגדירו אילוצים שיכבדו בעת יצירה אוטומטית של מערכת השעות.'
              : 'Define rules that auto-generation will respect.'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setShowDialog(true)}>
          {t('constraints.add')}
        </Button>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('constraints.name')}</TableCell>
                <TableCell>{t('constraints.type')}</TableCell>
                <TableCell>{isRtl ? 'פירוט' : 'Details'}</TableCell>
                <TableCell>{t('constraints.priority')}</TableCell>
                <TableCell>{t('constraints.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.name}</Typography>
                      {c.auto_day_off && (
                        <Chip
                          size="small"
                          label={isRtl ? 'אוטומטי' : 'auto'}
                          sx={{ height: 18, fontSize: 10, background: 'rgba(79,70,229,0.10)', color: 'primary.dark' }}
                          title={isRtl
                            ? 'נוצר אוטומטית כשיום החופש הוגדר על המורה. מחיקה כאן תבטל גם את יום החופש.'
                            : 'Auto-created from the teacher\'s day-off. Deleting here also clears the day-off.'}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, color: 'grey.600' }}>
                      {c.constraint_type_display}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, color: 'grey.700' }}>
                      {describeConstraint(c, { teachers, subjects, classes, tags }, isRtl)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.priority_display}
                      color={c.priority === 'hard' ? 'error' : 'default'}
                      variant={c.priority === 'hard' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch checked={c.is_active} onChange={() => handleToggle(c)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(c.id)}
                      sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {constraints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ borderBottom: 0 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 6 }}>
                      <Box
                        sx={{
                          width: 64, height: 64, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'linear-gradient(135deg, rgba(79,70,229,0.10), rgba(99,102,241,0.04))',
                          border: '1px dashed',
                          borderColor: 'primary.light',
                          color: 'primary.main',
                          mb: 1.5,
                        }}
                      >
                        <RuleIcon />
                      </Box>
                      <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'grey.700', mb: 0.25 }}>
                        {t('data.noData')}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'grey.500', mb: 2 }}>
                        {isRtl
                          ? 'הוסיפו אילוץ ראשון כדי להבטיח לוח זמנים תקין'
                          : 'Add your first constraint to ensure a valid schedule'}
                      </Typography>
                      <Button size="small" variant="contained" startIcon={<Add />} onClick={() => setShowDialog(true)}>
                        {t('constraints.add')}
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {showDialog && (
        <AddConstraintDialog
          teachers={teachers}
          subjects={subjects}
          classes={classes}
          tags={tags}
          onSave={async (data) => {
            await createConstraint({ ...data, school: 1 });
            setShowDialog(false);
            loadData();
          }}
          onClose={() => setShowDialog(false)}
        />
      )}
    </Box>
  );
}

function AddConstraintDialog({ teachers, subjects, classes, tags, onSave, onClose }: {
  teachers: any[];
  subjects: any[];
  classes: any[];
  tags: any[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const initial = TYPE_SCHEMAS[0];
  const [form, setForm] = useState<any>({
    name: '',
    constraint_type: initial.value,
    priority: 'hard',
    is_active: true,
    parameters: defaultParams(initial),
    teacher: null,
    subject: null,
    school_class: null,
    tag: null,
  });

  const schema = TYPE_SCHEMAS.find((s) => s.value === form.constraint_type) ?? initial;

  const switchType = (newType: string) => {
    const next = TYPE_SCHEMAS.find((s) => s.value === newType);
    if (!next) return;
    setForm({
      ...form,
      constraint_type: newType,
      parameters: defaultParams(next),
      teacher: null,
      subject: null,
      school_class: null,
      tag: null,
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('constraints.add')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            fullWidth label={t('constraints.name')} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            fullWidth select label={t('constraints.type')} value={form.constraint_type}
            onChange={(e) => switchType(e.target.value)}
          >
            {TYPE_SCHEMAS.map((s) => (
              <MenuItem key={s.value} value={s.value}>{isRtl ? s.labelHe : s.labelEn}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth select label={t('constraints.priority')} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            <MenuItem value="hard">{t('constraints.hard')}</MenuItem>
            <MenuItem value="soft">{t('constraints.soft')}</MenuItem>
          </TextField>

          {schema.fields.map((field, i) => (
            <FieldInput
              key={i}
              field={field}
              form={form}
              setForm={setForm}
              teachers={teachers}
              subjects={subjects}
              classes={classes}
              tags={tags}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)} disabled={!isFormValid(schema, form)}>
          {t('data.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FieldInput({ field, form, setForm, teachers, subjects, classes, tags }: {
  field: Field;
  form: any;
  setForm: (f: any) => void;
  teachers: any[];
  subjects: any[];
  classes: any[];
  tags: any[];
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
  const allLabel = t('constraints.all');

  if (field.kind === 'days') {
    const selected: number[] = Array.isArray(form.parameters[field.key])
      ? form.parameters[field.key]
      : [];
    const toggle = (d: number) => {
      const next = selected.includes(d)
        ? selected.filter((x) => x !== d)
        : [...selected, d].sort((a, b) => a - b);
      setForm({ ...form, parameters: { ...form.parameters, [field.key]: next } });
    };
    return (
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
          {L(field.labelKey, field.labelEn)}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          {DAY_LABELS.map((d) => (
            <Chip
              key={d.v}
              label={isRtl ? d.l : d.lEn}
              onClick={() => toggle(d.v)}
              color={selected.includes(d.v) ? 'primary' : 'default'}
              variant={selected.includes(d.v) ? 'filled' : 'outlined'}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Stack>
      </Box>
    );
  }

  if (field.kind === 'slots') {
    const slots: Array<{ day: number; period: number }> = Array.isArray(form.parameters[field.key])
      ? form.parameters[field.key]
      : [];
    const update = (next: any[]) =>
      setForm({ ...form, parameters: { ...form.parameters, [field.key]: next } });
    return (
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
          {L(field.labelKey, field.labelEn)}
        </Typography>
        <Stack spacing={1}>
          {slots.map((s, idx) => (
            <Stack key={idx} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                select size="small" label={L('יום', 'Day')} value={s.day}
                sx={{ minWidth: 110 }}
                onChange={(e) => {
                  const next = [...slots];
                  next[idx] = { ...s, day: Number(e.target.value) };
                  update(next);
                }}
              >
                {DAY_LABELS.map((d) => <MenuItem key={d.v} value={d.v}>{isRtl ? d.l : d.lEn}</MenuItem>)}
              </TextField>
              <TextField
                size="small" type="number" label={L('שעה', 'Period')} value={s.period}
                sx={{ width: 90 }}
                onChange={(e) => {
                  const next = [...slots];
                  next[idx] = { ...s, period: Number(e.target.value) };
                  update(next);
                }}
              />
              <IconButton size="small" onClick={() => update(slots.filter((_, i) => i !== idx))}
                sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}>
                <Delete fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small" startIcon={<AddCircleOutlined />} sx={{ alignSelf: 'flex-start' }}
            onClick={() => update([...slots, { day: 1, period: 1 }])}
          >
            {L('הוסף שעה חסומה', 'Add blocked period')}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (field.kind === 'param') {
    if (field.type === 'periods') {
      // CSV of integers, e.g., "5,6" — translate to array on save.
      return (
        <TextField
          fullWidth label={L(field.labelKey, field.labelEn)}
          helperText={L('הקלד מספרים מופרדים בפסיק. דוגמה: 5,6', 'Enter comma-separated numbers. Example: 5,6')}
          value={
            Array.isArray(form.parameters[field.key])
              ? form.parameters[field.key].join(',')
              : (form.parameters[field.key] ?? field.default)
          }
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw
              .split(',')
              .map((x) => parseInt(x.trim(), 10))
              .filter((n) => !Number.isNaN(n));
            setForm({
              ...form,
              parameters: { ...form.parameters, [field.key]: parsed.length ? parsed : raw },
            });
          }}
        />
      );
    }
    if (field.type === 'day') {
      return (
        <TextField
          fullWidth select label={L(field.labelKey, field.labelEn)}
          value={form.parameters[field.key] ?? field.default}
          onChange={(e) => setForm({
            ...form,
            parameters: { ...form.parameters, [field.key]: Number(e.target.value) },
          })}
        >
          {DAY_LABELS.map((d) => (
            <MenuItem key={d.v} value={d.v}>{isRtl ? d.l : d.lEn}</MenuItem>
          ))}
        </TextField>
      );
    }
    return (
      <TextField
        fullWidth type="number" label={L(field.labelKey, field.labelEn)}
        value={form.parameters[field.key] ?? field.default}
        onChange={(e) => setForm({
          ...form,
          parameters: { ...form.parameters, [field.key]: Number(e.target.value) },
        })}
      />
    );
  }

  if (field.kind === 'tag') {
    return (
      <TextField
        fullWidth select label={L('תגית מורים', 'Teacher tag')}
        value={form.tag ?? ''}
        onChange={(e) => setForm({ ...form, tag: e.target.value === '' ? null : Number(e.target.value) })}
      >
        {tags.length === 0 && <MenuItem value="" disabled>{L('אין תגיות — צרו ב-ניהול הנתונים', 'No tags — create them in Data Management')}</MenuItem>}
        {tags.map((x: any) => (
          <MenuItem key={x.id} value={x.id}>{x.name} ({x.teacher_count})</MenuItem>
        ))}
      </TextField>
    );
  }

  if (field.kind === 'teacher') {
    return (
      <TextField
        fullWidth select label={t('assignment.teacher')}
        value={form.teacher ?? ''}
        onChange={(e) => setForm({ ...form, teacher: e.target.value === '' ? null : Number(e.target.value) })}
      >
        {field.allowAll && <MenuItem value="">{allLabel}</MenuItem>}
        {teachers.map((x: any) => (
          <MenuItem key={x.id} value={x.id}>{x.full_name}</MenuItem>
        ))}
      </TextField>
    );
  }

  if (field.kind === 'subject') {
    return (
      <TextField
        fullWidth select label={t('assignment.subject')}
        value={form.subject ?? ''}
        onChange={(e) => setForm({ ...form, subject: e.target.value === '' ? null : Number(e.target.value) })}
      >
        {field.allowAll && <MenuItem value="">{allLabel}</MenuItem>}
        {subjects.map((x: any) => (
          <MenuItem key={x.id} value={x.id}>{x.name_he}</MenuItem>
        ))}
      </TextField>
    );
  }

  if (field.kind === 'class') {
    return (
      <TextField
        fullWidth select label={t('assignment.class')}
        value={form.school_class ?? ''}
        onChange={(e) => setForm({ ...form, school_class: e.target.value === '' ? null : Number(e.target.value) })}
      >
        {field.allowAll && <MenuItem value="">{allLabel}</MenuItem>}
        {classes.map((x: any) => (
          <MenuItem key={x.id} value={x.id}>{x.grade_name}{x.number}</MenuItem>
        ))}
      </TextField>
    );
  }

  return null;
}

function describeConstraint(
  c: any,
  lists: { teachers: any[]; subjects: any[]; classes: any[]; tags: any[] },
  isRtl = true,
): string {
  const L = (he: string, en: string) => (isRtl ? he : en);
  const p = c.parameters || {};
  const parts: string[] = [];

  // Target (who/what the rule applies to).
  if (c.teacher) {
    const t = lists.teachers.find((x) => x.id === c.teacher);
    parts.push(`${L('מורה', 'Teacher')}: ${t?.full_name ?? c.teacher}`);
  } else if (c.school_class) {
    const cl = lists.classes.find((x) => x.id === c.school_class);
    parts.push(`${L('כיתה', 'Class')}: ${cl ? `${cl.grade_name}${cl.number}` : c.school_class}`);
  } else if (c.subject) {
    const s = lists.subjects.find((x) => x.id === c.subject);
    parts.push(`${L('מקצוע', 'Subject')}: ${s?.name_he ?? c.subject}`);
  } else if (c.tag) {
    const tag = lists.tags.find((x) => x.id === c.tag);
    parts.push(`${L('תגית', 'Tag')}: ${tag?.name ?? c.tag}`);
  } else if (['max_daily_hours_class', 'max_daily_hours_teacher', 'consecutive_hours', 'lunch_break', 'no_last_period'].includes(c.constraint_type)) {
    parts.push(L('הכול', 'All'));
  }

  // Parameter summary, per type.
  const periods = Array.isArray(p.periods) ? p.periods.join(', ') : p.periods;
  switch (c.constraint_type) {
    case 'max_daily_hours_class':
    case 'max_daily_hours_teacher':
      if (p.max_hours != null) parts.push(L(`עד ${p.max_hours} שעות ביום`, `Up to ${p.max_hours} hours per day`));
      break;
    case 'consecutive_hours':
      if (p.max_per_day != null) parts.push(L(`עד ${p.max_per_day} ביום`, `Up to ${p.max_per_day} per day`));
      break;
    case 'consecutive_pair':
      parts.push(L(`לפחות ${p.min_pairs ?? 1} זוגות רצופים`, `At least ${p.min_pairs ?? 1} consecutive pairs`));
      break;
    case 'lunch_break':
      if (periods) parts.push(L(`שעות פנויות: ${periods}`, `Free periods: ${periods}`));
      break;
    case 'no_last_period':
      if (periods) parts.push(L(`שעות אסורות: ${periods}`, `Forbidden periods: ${periods}`));
      break;
    case 'teacher_availability': {
      const slots = Array.isArray(p.unavailable) ? p.unavailable : [];
      if (slots.length) {
        parts.push(L('חסום: ', 'Blocked: ') + slots.map((s: any) => `${dayLabel(s.day, isRtl)} ${s.period}`).join(', '));
      }
      break;
    }
    case 'subject_day_blackout': {
      const days = Array.isArray(p.days) ? p.days : [];
      if (days.length) {
        parts.push(L('ימים חסומים: ', 'Blocked days: ') + days.map((d: number) => dayLabel(d, isRtl)).join(', '));
      }
      break;
    }
    case 'group_blocked_slot': {
      const slots = Array.isArray(p.slots) ? p.slots : [];
      if (slots.length) {
        parts.push(slots.map((s: any) => `${dayLabel(s.day, isRtl)} ${s.period}`).join(', '));
      } else if (p.day != null) {
        parts.push(`${dayLabel(p.day, isRtl)} ${Array.isArray(p.periods) ? p.periods.join(', ') : p.periods ?? ''}`);
      }
      break;
    }
  }
  return parts.join(' · ');
}

function isFormValid(schema: TypeSchema, form: any): boolean {
  if (!form.name) return false;
  for (const f of schema.fields) {
    if (f.kind === 'teacher' && f.required && !form.teacher) return false;
    if (f.kind === 'subject' && f.required && !form.subject) return false;
    if (f.kind === 'class' && f.required && !form.school_class) return false;
    if (f.kind === 'tag' && f.required && !form.tag) return false;
    if (f.kind === 'slots') {
      const v = form.parameters[f.key];
      if (!Array.isArray(v) || v.length === 0) return false;
    }
    if (f.kind === 'days') {
      const v = form.parameters[f.key];
      if (!Array.isArray(v) || v.length === 0) return false;
    }
  }
  return true;
}

function defaultParams(schema: TypeSchema): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of schema.fields) {
    if (f.kind === 'param') out[f.key] = f.default;
    if (f.kind === 'slots') out[f.key] = [];
    if (f.kind === 'days') out[f.key] = [];
  }
  return out;
}
