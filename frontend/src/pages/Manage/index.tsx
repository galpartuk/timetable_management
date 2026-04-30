import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  CleaningServices as ClearIcon,
  Block as BlockIcon,
  AdminPanelSettings as ShieldIcon,
} from '@mui/icons-material';
import {
  bulkDelete, clearTimetableEntries, deleteTimetable, exportExcel,
  getExportOptions, getTimetables,
} from '../../api/client';

// ── catalog of export sheets, with friendly Hebrew labels and a hint of
// what data they include. Order here = display order.
type SheetMeta = { key: string; label: string; description: string; group: 'timetable' | 'master' | 'admin' };
const SHEETS: SheetMeta[] = [
  { key: 'timetable_by_class', label: 'מערכת לפי כיתה', description: 'עמוד נפרד לכל כיתה — ימים × שיעורים', group: 'timetable' },
  { key: 'timetable_by_teacher', label: 'מערכת לפי מורה', description: 'עמוד נפרד לכל מורה — ימים × שיעורים', group: 'timetable' },
  { key: 'timetable_flat', label: 'כל השיעורים (טבלה אחת)', description: 'כל השורות במערכת בעמוד אחד', group: 'timetable' },
  { key: 'conflicts', label: 'התנגשויות', description: 'מורה/כיתה/חדר משובצים פעמיים באותה משבצת', group: 'timetable' },

  { key: 'teachers', label: 'מורים', description: 'שמות, אימייל, טלפון, מקס שעות, יום חופש', group: 'master' },
  { key: 'subjects', label: 'מקצועות', description: 'שם בעברית/אנגלית, צבע', group: 'master' },
  { key: 'classes', label: 'כיתות', description: 'שכבה, מספר, סוג, מספר תלמידים', group: 'master' },
  { key: 'time_slots', label: 'משבצות זמן', description: 'יום ושיעור עם זמני התחלה וסיום', group: 'master' },
  { key: 'rooms', label: 'חדרים', description: 'שם, קיבולת, סוג', group: 'master' },
  { key: 'assignments', label: 'שיבוצי הוראה', description: 'מי מלמד מה למי וכמה שעות', group: 'master' },
  { key: 'constraints', label: 'אילוצים', description: 'אילוצים מוגדרים: סוג, עדיפות, פרמטרים', group: 'master' },
  { key: 'import_logs', label: 'יומן ייבואים', description: '200 הייבואים האחרונים', group: 'master' },

  { key: 'users', label: 'משתמשים', description: 'כל המשתמשים, תפקידים, התחברות אחרונה (super_admin)', group: 'admin' },
  { key: 'audit_logins', label: 'יומן התחברויות', description: '1000 התחברויות אחרונות (super_admin)', group: 'admin' },
  { key: 'audit_activities', label: 'יומן פעולות', description: '1000 פעולות אחרונות (super_admin)', group: 'admin' },
];

const GROUP_TITLES: Record<SheetMeta['group'], string> = {
  timetable: 'מערכת השעות',
  master: 'נתוני בסיס',
  admin: 'ניהול ובקרה',
};

type TabValue = 'export' | 'manage';

export default function ManagePage() {
  const { t } = useTranslation();
  void t;
  const [tab, setTab] = useState<TabValue>('export');

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>ייצוא וניהול נתונים</Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          ייצא את נתוני המערכת לקובץ אקסל, או נקה נתונים. פעולות מחיקה הן בלתי-הפיכות.
        </Typography>
      </Box>

      <Box sx={{ display: 'inline-flex', gap: 0.5, padding: 0.5, background: 'grey.100', borderRadius: 3, mb: 3 }}>
        <PillTab label="ייצוא" active={tab === 'export'} onClick={() => setTab('export')} />
        <PillTab label="ניהול נתונים" active={tab === 'manage'} onClick={() => setTab('manage')} danger />
      </Box>

      {tab === 'export' && <ExportTab />}
      {tab === 'manage' && <ManageTab />}
    </Box>
  );
}

function PillTab({ label, active, onClick, danger }: {
  label: string; active: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <Box
      role="tab"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      sx={{
        cursor: 'pointer',
        userSelect: 'none',
        px: 2, py: 1,
        borderRadius: 2.5,
        fontSize: 13, fontWeight: 600,
        color: active ? (danger ? 'error.dark' : 'grey.900') : 'grey.600',
        background: active ? '#fff' : 'transparent',
        boxShadow: active ? '0 1px 2px 0 rgba(15,23,42,0.06), 0 1px 3px 0 rgba(15,23,42,0.06)' : 'none',
        transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        '&:hover': { color: danger ? 'error.dark' : 'grey.900' },
      }}
    >
      {label}
    </Box>
  );
}

// ── EXPORT TAB ────────────────────────────────────────────────────────────

function ExportTab() {
  const [options, setOptions] = useState<{ super_admin_only: string[]; is_super_admin: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set([
    'timetable_by_class', 'teachers', 'subjects', 'classes', 'assignments',
  ]));
  const [timetables, setTimetables] = useState<any[]>([]);
  const [timetableId, setTimetableId] = useState<number | ''>('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getExportOptions().then((r) => setOptions(r.data)).catch(() => {});
    getTimetables().then((r) => {
      const list = r.data.results ?? [];
      setTimetables(list);
      if (list.length > 0) setTimetableId(list[0].id);
    }).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const out: Record<SheetMeta['group'], SheetMeta[]> = { timetable: [], master: [], admin: [] };
    for (const s of SHEETS) out[s.group].push(s);
    return out;
  }, []);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  };
  const toggleGroup = (g: SheetMeta['group'], allChecked: boolean) => {
    const next = new Set(selected);
    for (const s of SHEETS.filter((x) => x.group === g)) {
      if (allChecked) next.delete(s.key); else next.add(s.key);
    }
    setSelected(next);
  };

  const isSuperAdmin = options?.is_super_admin ?? false;
  const needsTimetable = useMemo(
    () => SHEETS.some((s) => s.group === 'timetable' && selected.has(s.key)),
    [selected],
  );

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await exportExcel({
        sheets: Array.from(selected),
        timetable_id: timetableId || undefined,
        school_id: 1,
      });
      // res.data is a Blob (responseType: 'blob' in axios). Trigger download.
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetable_export_${timetableId || 'all'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // Blob error responses need a different unwrap.
      let msg = 'הייצוא נכשל';
      if (e.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await e.response.data.text())?.error || msg;
        } catch { /* keep default */ }
      } else if (e.response?.data?.error) {
        msg = e.response.data.error;
      }
      setError(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {needsTimetable && (
        <Card>
          <CardContent>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
              מערכת לייצוא (לעמודי מערכת השעות)
            </Typography>
            <TextField
              select size="small" fullWidth
              value={timetableId}
              onChange={(e) => setTimetableId(Number(e.target.value))}
              sx={{ maxWidth: 360 }}
            >
              {timetables.length === 0 && <MenuItem value="" disabled>אין מערכות</MenuItem>}
              {timetables.map((tt: any) => (
                <MenuItem key={tt.id} value={tt.id}>
                  {tt.name} — {tt.academic_year}
                </MenuItem>
              ))}
            </TextField>
          </CardContent>
        </Card>
      )}

      {(['timetable', 'master', 'admin'] as const).map((group) => {
        const groupSheets = grouped[group];
        const allChecked = groupSheets.every((s) => selected.has(s.key));
        const someChecked = groupSheets.some((s) => selected.has(s.key));
        return (
          <Card key={group}>
            <CardContent>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{GROUP_TITLES[group]}</Typography>
                <Button
                  size="small" variant="text"
                  onClick={() => toggleGroup(group, allChecked)}
                >
                  {allChecked ? 'נקה הכול' : 'בחר הכול'}
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {groupSheets.map((s) => {
                  const requiresAdmin = options?.super_admin_only.includes(s.key);
                  const disabled = requiresAdmin && !isSuperAdmin;
                  return (
                    <FormControlLabel
                      key={s.key}
                      control={
                        <Checkbox
                          checked={selected.has(s.key)}
                          onChange={() => toggle(s.key)}
                          disabled={disabled}
                          size="small"
                        />
                      }
                      label={
                        <Box>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{s.label}</Typography>
                            {requiresAdmin && (
                              <Chip size="small" icon={<ShieldIcon sx={{ fontSize: 12 }} />} label="super_admin"
                                    sx={{ height: 18, fontSize: 10, background: 'rgba(79,70,229,0.10)', color: 'primary.dark' }} />
                            )}
                          </Stack>
                          <Typography sx={{ fontSize: 12, color: 'grey.600' }}>{s.description}</Typography>
                        </Box>
                      }
                      sx={{
                        mr: 0, py: 0.5, alignItems: 'flex-start',
                        '& .MuiFormControlLabel-label': { mt: 0.25 },
                        opacity: disabled ? 0.5 : 1,
                      }}
                    />
                  );
                })}
                {!someChecked && <Typography sx={{ fontSize: 12, color: 'grey.400', mt: 1 }}>—</Typography>}
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      <Card sx={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.04), rgba(99,102,241,0.02))' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}
                 sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                {selected.size === 0 ? 'בחר לפחות עמוד אחד לייצוא' : `${selected.size} עמודים נבחרו`}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                הקובץ יורד ישירות לדפדפן.
              </Typography>
            </Box>
            <Button
              variant="contained" size="large"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={selected.size === 0 || downloading || (needsTimetable && !timetableId)}
              onClick={download}
            >
              {downloading ? 'מייצא…' : 'הורד אקסל'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ── DATA MANAGEMENT TAB (Danger Zone) ─────────────────────────────────────

interface DangerOp {
  key: string;
  title: string;
  body: string;
  buttonLabel: string;
  icon: ReactElement;
  superAdminOnly?: boolean;
  scope?: 'timetable';   // requires picking a specific timetable
  bulkOperation?: string; // for bulkDelete operations
}

const DANGER_OPS: DangerOp[] = [
  {
    key: 'delete_one_timetable',
    title: 'מחק מערכת שעות',
    body: 'מחיקת מערכת שעות אחת על שיעוריה. הפעולה אינה הפיכה.',
    buttonLabel: 'מחק מערכת',
    icon: <DeleteIcon />,
    scope: 'timetable',
  },
  {
    key: 'clear_timetable_entries',
    title: 'נקה שיעורים ממערכת',
    body: 'מסיר את כל השיעורים ממערכת קיימת אך משאיר את המערכת עצמה (סטטוס יחזור ל-DRAFT).',
    buttonLabel: 'נקה שיעורים',
    icon: <ClearIcon />,
    scope: 'timetable',
  },
  {
    key: 'clear_assignments',
    title: 'נקה את כל שיבוצי ההוראה',
    body: 'מסיר את כל ה-TeachingAssignment של בית הספר. סולבר לא יוכל לרוץ עד שיתווספו שיבוצים חדשים.',
    buttonLabel: 'נקה שיבוצים',
    icon: <ClearIcon />,
    bulkOperation: 'clear_assignments',
  },
  {
    key: 'clear_all_timetables',
    title: 'מחק את כל מערכות השעות',
    body: 'מוחק את כל המערכות וכל השיעורים שלהן. נתוני בסיס (מורים, מקצועות, כיתות) נשארים.',
    buttonLabel: 'מחק את כל המערכות',
    icon: <DeleteIcon />,
    bulkOperation: 'clear_all_timetables',
  },
  {
    key: 'clear_subjects',
    title: 'נקה מקצועות',
    body: 'מוחק את כל המקצועות. ייכשל אם הם בשימוש בשיבוצים או בשיעורים — נקה אותם קודם.',
    buttonLabel: 'נקה מקצועות',
    icon: <ClearIcon />,
    bulkOperation: 'clear_subjects',
  },
  {
    key: 'clear_teachers',
    title: 'נקה מורים',
    body: 'מוחק את כל המורים. ייכשל אם הם בשימוש בשיבוצים או בשיעורים — נקה אותם קודם.',
    buttonLabel: 'נקה מורים',
    icon: <ClearIcon />,
    bulkOperation: 'clear_teachers',
  },
  {
    key: 'wipe_school_data',
    title: 'אפס את כל נתוני התזמון (Super Admin)',
    body: 'מוחק את כל המערכות, השיעורים, שיבוצי ההוראה והאילוצים של בית הספר. נתוני בסיס (מורים, מקצועות, כיתות, משבצות זמן, חדרים) נשארים.',
    buttonLabel: 'אפס הכול',
    icon: <BlockIcon />,
    superAdminOnly: true,
    bulkOperation: 'wipe_school_data',
  },
];

function ManageTab() {
  const [options, setOptions] = useState<{ is_super_admin: boolean } | null>(null);
  const [timetables, setTimetables] = useState<any[]>([]);
  const [confirm, setConfirm] = useState<{ op: DangerOp; timetableId?: number } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    getExportOptions().then((r) => setOptions(r.data)).catch(() => {});
    getTimetables().then((r) => setTimetables(r.data.results ?? [])).catch(() => {});
  }, []);

  const refreshTimetables = () =>
    getTimetables().then((r) => setTimetables(r.data.results ?? [])).catch(() => {});

  const isSuperAdmin = options?.is_super_admin ?? false;

  const run = async () => {
    if (!confirm) return;
    setWorking(true);
    setError('');
    setInfo('');
    try {
      const op = confirm.op;
      let res: any;
      if (op.key === 'delete_one_timetable' && confirm.timetableId) {
        res = await deleteTimetable(confirm.timetableId);
      } else if (op.key === 'clear_timetable_entries' && confirm.timetableId) {
        res = await clearTimetableEntries(confirm.timetableId);
      } else if (op.bulkOperation) {
        res = await bulkDelete(op.bulkOperation, 1);
      }
      const summary = res?.data?.summary || res?.data;
      setInfo(`✓ ${op.title} — ${JSON.stringify(summary, null, 0)}`);
      setConfirm(null);
      refreshTimetables();
    } catch (e: any) {
      setError(e.response?.data?.error || 'הפעולה נכשלה');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="warning" icon={<WarningIcon />}>
        <strong>אזור מסוכן.</strong> הפעולות בעמוד הזה אינן הפיכות. ודא שיש לך גיבוי לפני שתבצע מחיקות מסיביות.
      </Alert>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo('')}>{info}</Alert>}

      {DANGER_OPS.map((op) => {
        const blocked = op.superAdminOnly && !isSuperAdmin;
        return (
          <Card key={op.key} sx={{ borderColor: 'error.light' }}>
            <CardContent>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(244, 63, 94, 0.10)',
                  color: 'error.main',
                  flexShrink: 0,
                }}>
                  {op.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{op.title}</Typography>
                    {op.superAdminOnly && (
                      <Chip size="small" icon={<ShieldIcon sx={{ fontSize: 12 }} />} label="super_admin"
                            sx={{ height: 20, fontSize: 11, background: 'rgba(79,70,229,0.10)', color: 'primary.dark' }} />
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: 'grey.700', mb: 1.5 }}>{op.body}</Typography>
                  <DangerLauncher
                    op={op}
                    timetables={timetables}
                    blocked={blocked}
                    onLaunch={(timetableId) => setConfirm({ op, timetableId })}
                  />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!confirm} onClose={() => !working && setConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>אישור פעולה הרסנית</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <strong>{confirm?.op.title}</strong>
            <Box component="span" sx={{ display: 'block', mt: 1, color: 'grey.700' }}>
              {confirm?.op.body}
            </Box>
          </DialogContentText>
          <Divider sx={{ my: 2 }} />
          <DialogContentText sx={{ color: 'error.dark' }}>
            הפעולה אינה הפיכה. האם להמשיך?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={working}>ביטול</Button>
          <Button
            variant="contained" color="error"
            onClick={run} disabled={working}
            startIcon={working ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            כן, בצע מחיקה
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function DangerLauncher({ op, timetables, blocked, onLaunch }: {
  op: DangerOp;
  timetables: any[];
  blocked: boolean | undefined;
  onLaunch: (timetableId?: number) => void;
}) {
  const [tid, setTid] = useState<number | ''>('');

  if (blocked) {
    return (
      <Button size="small" variant="outlined" disabled startIcon={<BlockIcon fontSize="small" />}>
        דרושה הרשאת super_admin
      </Button>
    );
  }

  if (op.scope === 'timetable') {
    return (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select size="small"
          value={tid}
          onChange={(e) => setTid(Number(e.target.value))}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="" disabled>בחר מערכת</MenuItem>
          {timetables.map((tt: any) => (
            <MenuItem key={tt.id} value={tt.id}>
              {tt.name} — {tt.academic_year}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained" color="error" size="small"
          startIcon={op.icon}
          disabled={!tid}
          onClick={() => onLaunch(tid as number)}
        >
          {op.buttonLabel}
        </Button>
      </Stack>
    );
  }

  return (
    <Button
      variant="contained" color="error" size="small"
      startIcon={op.icon}
      onClick={() => onLaunch()}
    >
      {op.buttonLabel}
    </Button>
  );
}
