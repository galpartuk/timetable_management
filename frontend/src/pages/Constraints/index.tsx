import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Button, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import {
  getConstraints, createConstraint, updateConstraint, deleteConstraint,
  getTeachers, getSubjects, getClasses,
} from '../../api/client';

/**
 * Per-type form schema. Adding a new constraint type = add an entry here
 * and a matching handler on the backend (solver/constraints.py).
 *
 * Each schema declares which built-in fields show (teacher / subject / class)
 * and which numeric parameters live inside `parameters` JSON.
 */
type Field =
  | { kind: 'teacher'; required?: boolean; allowAll?: boolean }
  | { kind: 'subject'; required?: boolean; allowAll?: boolean }
  | { kind: 'class'; required?: boolean; allowAll?: boolean }
  | { kind: 'param'; key: string; labelKey: string; type: 'number'; default: number };

interface TypeSchema {
  value: string;
  labelKey: string;
  fields: Field[];
}

const TYPE_SCHEMAS: TypeSchema[] = [
  {
    value: 'max_daily_hours_class',
    labelKey: 'constraints.maxDailyClass',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'constraints.maxHours', type: 'number', default: 8 },
    ],
  },
  {
    value: 'max_daily_hours_teacher',
    labelKey: 'constraints.maxDailyTeacher',
    fields: [
      { kind: 'teacher', allowAll: true },
      { kind: 'param', key: 'max_hours', labelKey: 'constraints.maxHours', type: 'number', default: 6 },
    ],
  },
  {
    value: 'consecutive_hours',
    labelKey: 'constraints.maxPerDaySubject',
    fields: [
      { kind: 'class', allowAll: true },
      { kind: 'subject', allowAll: true },
      { kind: 'param', key: 'max_per_day', labelKey: 'constraints.maxPerDay', type: 'number', default: 2 },
    ],
  },
  {
    value: 'teacher_availability',
    labelKey: 'constraints.teacherAvailability',
    fields: [{ kind: 'teacher', required: true }],
  },
];

export default function ConstraintsPage() {
  const { t } = useTranslation();
  const [constraints, setConstraints] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {t('constraints.title')}
        </Typography>
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
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.constraint_type_display}</TableCell>
                  <TableCell>{c.priority_display}</TableCell>
                  <TableCell>
                    <Switch checked={c.is_active} onChange={() => handleToggle(c)} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}>
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {constraints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">{t('data.noData')}</TableCell>
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
        <TextField
          fullWidth label={t('constraints.name')} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth select label={t('constraints.type')} value={form.constraint_type}
          onChange={(e) => switchType(e.target.value)}
          margin="normal"
        >
          {TYPE_SCHEMAS.map((s) => (
            <MenuItem key={s.value} value={s.value}>{t(s.labelKey)}</MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth select label={t('constraints.priority')} value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          margin="normal"
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('data.cancel')}</Button>
        <Button variant="contained" onClick={() => onSave(form)}>{t('data.save')}</Button>
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
    return (
      <TextField
        fullWidth type="number" label={t(field.labelKey)}
        value={form.parameters[field.key] ?? field.default}
        onChange={(e) => setForm({
          ...form,
          parameters: { ...form.parameters, [field.key]: Number(e.target.value) },
        })}
        margin="normal"
      />
    );
  }

  if (field.kind === 'teacher') {
    return (
      <TextField
        fullWidth select label={t('assignment.teacher')}
        value={form.teacher ?? ''}
        onChange={(e) => setForm({ ...form, teacher: e.target.value === '' ? null : Number(e.target.value) })}
        margin="normal"
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
        margin="normal"
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
        margin="normal"
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
