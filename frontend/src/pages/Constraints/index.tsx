import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Button, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Stack, Chip,
} from '@mui/material';
import { Add, Delete, Rule as RuleIcon } from '@mui/icons-material';
import {
  getConstraints, createConstraint, updateConstraint, deleteConstraint,
  getTeachers, getSubjects, getClasses,
} from '../../api/client';

type Field =
  | { kind: 'teacher'; required?: boolean; allowAll?: boolean }
  | { kind: 'subject'; required?: boolean; allowAll?: boolean }
  | { kind: 'class'; required?: boolean; allowAll?: boolean }
  | { kind: 'param'; key: string; labelKey: string; type: 'number' | 'periods'; default: any };

interface TypeSchema {
  value: string;
  labelHe: string;
  description?: string;
  fields: Field[];
}

const TYPE_SCHEMAS: TypeSchema[] = [
  {
    value: 'max_daily_hours_class',
    labelHe: 'מקסימום שעות ביום לכיתה',
    description: 'הגבלת שיעורים יומיים לכל כיתה (או כיתה ספציפית).',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'שעות מקסימום', type: 'number', default: 8 },
    ],
  },
  {
    value: 'max_daily_hours_teacher',
    labelHe: 'מקסימום שעות ביום למורה',
    description: 'הגבלת שיעורים יומיים לכל מורה (או מורה ספציפי).',
    fields: [
      { kind: 'teacher', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'שעות מקסימום', type: 'number', default: 6 },
    ],
  },
  {
    value: 'consecutive_hours',
    labelHe: 'מקסימום שעות מקצוע ליום',
    description: 'כמה שיעורים של מקצוע יכולים להיות באותו יום באותה כיתה.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'subject', allowAll: true },
      { kind: 'param', key: 'max_per_day', labelKey: 'מקס׳ ליום', type: 'number', default: 2 },
    ],
  },
  {
    value: 'consecutive_pair',
    labelHe: 'זוג שיעורים רצופים',
    description: 'כופה שלפחות N שיעורים של (כיתה, מקצוע) יהיו רצופים בלוח. שימושי למתמטיקה ומעבדות.',
    fields: [
      { kind: 'class', required: true },
      { kind: 'subject', required: true },
      { kind: 'param', key: 'min_pairs', labelKey: 'מינ׳ זוגות', type: 'number', default: 1 },
    ],
  },
  {
    value: 'lunch_break',
    labelHe: 'הפסקת אוכל',
    description: 'שעה אחת או יותר ביום שלא יוקצו לה שיעורים. לדוגמה: שעה 5.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'param', key: 'periods', labelKey: 'שעות הפנויות (CSV)', type: 'periods', default: '5' },
    ],
  },
  {
    value: 'no_last_period',
    labelHe: 'לא בשיעור אחרון',
    description: 'אסור לחבב שיעורים בשעות 9-10 של היום.',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'subject', allowAll: true },
      { kind: 'teacher', allowAll: true },
      { kind: 'param', key: 'periods', labelKey: 'שעות אסורות (CSV)', type: 'periods', default: '10' },
    ],
  },
  {
    value: 'teacher_availability',
    labelHe: 'זמינות מורה',
    description: 'חסום זמנים ספציפיים בהם המורה לא יכול ללמד.',
    fields: [{ kind: 'teacher', required: true }],
  },
];

export default function ConstraintsPage() {
  const { t, i18n } = useTranslation();
  const [constraints, setConstraints] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const isRtl = i18n.language === 'he';

  const loadData = () => {
    getConstraints().then((r: any) => setConstraints(r.data.results ?? [])).catch(() => {});
    getTeachers().then((r: any) => setTeachers(r.data.results ?? [])).catch(() => {});
    getSubjects().then((r: any) => setSubjects(r.data.results ?? [])).catch(() => {});
    getClasses().then((r: any) => setClasses(r.data.results ?? [])).catch(() => {});
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
                <TableCell>{t('constraints.priority')}</TableCell>
                <TableCell>{t('constraints.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, color: 'grey.600' }}>
                      {c.constraint_type_display}
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
                  <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
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

function AddConstraintDialog({ teachers, subjects, classes, onSave, onClose }: {
  teachers: any[];
  subjects: any[];
  classes: any[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
              <MenuItem key={s.value} value={s.value}>{s.labelHe}</MenuItem>
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
            />
          ))}
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

function FieldInput({ field, form, setForm, teachers, subjects, classes }: {
  field: Field;
  form: any;
  setForm: (f: any) => void;
  teachers: any[];
  subjects: any[];
  classes: any[];
}) {
  const { t } = useTranslation();
  const allLabel = t('constraints.all');

  if (field.kind === 'param') {
    if (field.type === 'periods') {
      // CSV of integers, e.g., "5,6" — translate to array on save.
      return (
        <TextField
          fullWidth label={field.labelKey}
          helperText="הקלד מספרים מופרדים בפסיק. דוגמה: 5,6"
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
    return (
      <TextField
        fullWidth type="number" label={field.labelKey}
        value={form.parameters[field.key] ?? field.default}
        onChange={(e) => setForm({
          ...form,
          parameters: { ...form.parameters, [field.key]: Number(e.target.value) },
        })}
      />
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

function defaultParams(schema: TypeSchema): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of schema.fields) {
    if (f.kind === 'param') out[f.key] = f.default;
  }
  return out;
}
