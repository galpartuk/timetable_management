import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, LinearProgress, MenuItem, Stack, TextField,
  Typography,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  CleaningServices as ClearIcon,
  Block as BlockIcon,
  AdminPanelSettings as ShieldIcon,
  CheckCircle as CheckIcon,
  Assessment as ReportIcon,
} from '@mui/icons-material';
import {
  bulkDelete, clearTimetableEntries, deleteTimetable, exportExcel,
  getExportOptions, getTimetables, uploadExcel, getGapAnalysis,
  getTimetableQuality,
  type ImportResponse, type GapAnalysis, type TimetableQuality,
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

type TabValue = 'import' | 'export' | 'gaps' | 'quality' | 'manage';

export default function ManagePage() {
  const { t } = useTranslation();
  void t;
  const [tab, setTab] = useState<TabValue>('import');

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>ייבוא, ייצוא וניהול נתונים</Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          ייבא את הערכות שעות ההוראה מקובץ אקסל, צפה במצב הנתונים, ייצא נתונים, או נקה.
          פעולות מחיקה הן בלתי-הפיכות.
        </Typography>
      </Box>

      <Box sx={{ display: 'inline-flex', gap: 0.5, padding: 0.5, background: 'grey.100', borderRadius: 3, mb: 3 }}>
        <PillTab label="ייבוא Excel" active={tab === 'import'} onClick={() => setTab('import')} />
        <PillTab label="פערי נתונים" active={tab === 'gaps'} onClick={() => setTab('gaps')} />
        <PillTab label="איכות מערכת" active={tab === 'quality'} onClick={() => setTab('quality')} />
        <PillTab label="ייצוא" active={tab === 'export'} onClick={() => setTab('export')} />
        <PillTab label="ניהול נתונים" active={tab === 'manage'} onClick={() => setTab('manage')} danger />
      </Box>

      {tab === 'import' && <ImportTab />}
      {tab === 'gaps' && <GapAnalysisTab />}
      {tab === 'quality' && <QualityTab />}
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

// ── IMPORT TAB ────────────────────────────────────────────────────────────

function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [wipeExisting, setWipeExisting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setCommitResult(null);
      setError('');
    }
  };

  const doDryRun = async () => {
    if (!file) return;
    setPreviewing(true);
    setError('');
    setCommitResult(null);
    try {
      const res = await uploadExcel(file, 1, { dryRun: true, wipeExisting });
      setPreview(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'תצוגה מקדימה נכשלה');
    } finally {
      setPreviewing(false);
    }
  };

  const doCommit = async () => {
    if (!file) return;
    setCommitting(true);
    setError('');
    try {
      const res = await uploadExcel(file, 1, { dryRun: false, wipeExisting });
      setCommitResult(res.data);
      setPreview(null);
    } catch (e: any) {
      setError(e.response?.data?.error || 'הייבוא נכשל');
    } finally {
      setCommitting(false);
    }
  };

  const p = preview?.preview;

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        העלאת קובץ Excel בפורמט "הערכות לשנת הלימודים".
        השלב הראשון הוא <strong>תצוגה מקדימה</strong> ללא שינוי במסד הנתונים —
        רק לאחר אישור תועלה הגרסה לבסיס הנתונים.
      </Alert>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <CardContent>
          <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1.5 }}>1. בחר קובץ</Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
              disabled={previewing || committing}
            >
              בחר קובץ .xlsx
              <input
                hidden
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={onPickFile}
              />
            </Button>
            {file && (
              <>
                <Typography sx={{ fontSize: 14 }}>{file.name}</Typography>
                <Typography sx={{ fontSize: 12, color: 'grey.500' }}>
                  ({(file.size / 1024).toFixed(0)} KB)
                </Typography>
                <Button size="small" onClick={reset} disabled={previewing || committing}>
                  נקה
                </Button>
              </>
            )}
          </Stack>

          <FormControlLabel
            sx={{ mt: 2, display: 'block' }}
            control={
              <Checkbox
                size="small"
                checked={wipeExisting}
                onChange={(e) => setWipeExisting(e.target.checked)}
                disabled={previewing || committing}
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                  מחק נתונים קיימים לפני הייבוא
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                  ימחק את כל המורים, המקצועות, שיבוצי ההוראה והתפקידים של בית הספר
                  לפני ייבוא ה-Excel. הכיתות והגדרות נוספות נשארות.
                </Typography>
              </Box>
            }
          />

          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              startIcon={previewing ? <CircularProgress size={16} /> : <ReportIcon />}
              onClick={doDryRun}
              disabled={!file || previewing || committing}
            >
              תצוגה מקדימה
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {p && (
        <Card sx={{ borderColor: 'primary.light' }}>
          <CardContent>
            <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1.5 }}>
              2. סיכום תצוגה מקדימה
            </Typography>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', mb: 2 }}>
              <Stat label="גיליונות" value={p.sheets_seen.length} />
              <Stat label="שורות שיבוצים" value={p.assignment_rows_total} />
              <Stat label="שורות תפקידים" value={p.role_rows_total} />
              <Stat label="מקצועות" value={p.subjects_distinct} />
              <Stat label="מורים (ייחודיים)" value={p.teachers_distinct} />
              <Stat label="שורות עם מורה" value={p.rows_with_teacher} />
              <Stat label="שורות בקבוצות (pool)" value={p.pool_rows} />
              <Stat label="שורות פתיחה מותנית" value={p.inactive_rows} />
            </Stack>

            {Object.keys(p.class_rows_per_grade || {}).length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700' }}>
                  שורות לפי שכבה
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                  {Object.entries(p.class_rows_per_grade).map(([g, n]) => (
                    <Chip key={g} size="small" label={`${g}: ${n}`} />
                  ))}
                </Stack>
              </Box>
            )}

            {p.warnings.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'warning.dark' }}>
                  אזהרות ({p.warnings.length})
                </Typography>
                <Box sx={{ maxHeight: 160, overflow: 'auto', mt: 0.5, fontSize: 12 }}>
                  {p.warnings.slice(0, 50).map((w, i) => (
                    <Typography key={i} sx={{ fontSize: 12, color: 'grey.700' }}>
                      • {w}
                    </Typography>
                  ))}
                  {p.warnings.length > 50 && (
                    <Typography sx={{ fontSize: 11, color: 'grey.500' }}>
                      … +{p.warnings.length - 50} אזהרות נוספות
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {p.errors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>שגיאות:</Typography>
                {p.errors.slice(0, 20).map((e, i) => (
                  <Typography key={i} sx={{ fontSize: 12 }}>• {e}</Typography>
                ))}
              </Alert>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1.5 }}>
              3. אישור ייבוא לבסיס הנתונים
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'grey.700', mb: 1.5 }}>
              לאחר אישור, הנתונים ייכתבו לבסיס הנתונים. הפעולה אינה הפיכה
              {wipeExisting && (
                <strong> ותמחק את כל הנתונים הקיימים לפני ההכנסה</strong>
              )}.
            </Typography>
            <Button
              variant="contained"
              color={wipeExisting ? 'error' : 'primary'}
              size="large"
              startIcon={committing ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
              onClick={doCommit}
              disabled={committing}
            >
              {committing ? 'מייבא…' : 'אשר ויבא לבסיס נתונים'}
            </Button>
            {committing && <LinearProgress sx={{ mt: 1.5 }} />}
          </CardContent>
        </Card>
      )}

      {commitResult && (
        <Alert severity="success">
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
            ✓ הייבוא הושלם בהצלחה
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', fontSize: 13 }}>
            <Box>מקצועות שנוספו: <strong>{commitResult.subjects_imported}</strong></Box>
            <Box>מורים שנוספו: <strong>{commitResult.teachers_imported}</strong></Box>
            <Box>כיתות שנוספו: <strong>{commitResult.classes_imported}</strong></Box>
            <Box>שיבוצים: <strong>{commitResult.assignments_imported}</strong></Box>
            <Box>תפקידים: <strong>{commitResult.roles_imported}</strong></Box>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Box sx={{
      px: 2, py: 1.25,
      background: 'grey.50',
      borderRadius: 2,
      minWidth: 120,
    }}>
      <Typography sx={{ fontSize: 11, color: 'grey.600' }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

// ── GAP ANALYSIS TAB ───────────────────────────────────────────────────────

function GapAnalysisTab() {
  const [data, setData] = useState<GapAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getGapAnalysis(1);
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'טעינת הנתונים נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return null;
  }

  const overCap = data.teacher_loads.filter((t) => t.over_cap);
  const underTaught = data.teacher_loads.filter((t) => t.under_must_teach);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>סיכום מצב הנתונים</Typography>
        <Button size="small" onClick={load} disabled={loading}>רענן</Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
        <GapCard
          title="כיתות ללא מחנכ/ת"
          count={data.classes_missing_homeroom_count}
          severity={data.classes_missing_homeroom_count > 0 ? 'warning' : 'ok'}
        >
          {data.classes_missing_homeroom.slice(0, 30).map((c) => (
            <Chip key={c.id} size="small" label={`${c.grade__name}${c.number}`} sx={{ mr: 0.5, mb: 0.5 }} />
          ))}
        </GapCard>

        <GapCard
          title="שיבוצים ללא מורה"
          count={data.assignments_without_teacher_count}
          severity={data.assignments_without_teacher_count > 0 ? 'warning' : 'ok'}
        >
          <Typography sx={{ fontSize: 12, color: 'grey.700' }}>
            {data.assignments_without_teacher_count} שיעורים ללא מורה מוקצה.
            הסולבר ידלג עליהם.
          </Typography>
        </GapCard>

        <GapCard
          title="מורים מעל מכסה"
          count={overCap.length}
          severity={overCap.length > 0 ? 'error' : 'ok'}
        >
          {overCap.slice(0, 20).map((t) => (
            <Typography key={t.id} sx={{ fontSize: 12 }}>
              {t.name}: {t.assigned_hours}h / מקס {t.cap}h
            </Typography>
          ))}
        </GapCard>

        <GapCard
          title="מורים פחות מחובת ההוראה"
          count={underTaught.length}
          severity={underTaught.length > 0 ? 'warning' : 'ok'}
        >
          {underTaught.slice(0, 20).map((t) => (
            <Typography key={t.id} sx={{ fontSize: 12 }}>
              {t.name}: {t.assigned_hours}h / חובה {t.must_teach}h
            </Typography>
          ))}
        </GapCard>
      </Stack>

      <Card>
        <CardContent>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
            עומס מורים (Top 30)
          </Typography>
          <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
            <Box component="table" sx={{ width: '100%', fontSize: 12 }}>
              <Box component="thead">
                <Box component="tr" sx={{ '& th': { textAlign: 'right', py: 0.5, borderBottom: '1px solid', borderColor: 'grey.200', fontWeight: 700 } }}>
                  <Box component="th">מורה</Box>
                  <Box component="th">שעות הוראה</Box>
                  <Box component="th">שעות תפקיד</Box>
                  <Box component="th">חובת הוראה</Box>
                  <Box component="th">מכסה</Box>
                  <Box component="th">סטטוס</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {data.teacher_loads.slice(0, 30).map((t) => (
                  <Box key={t.id} component="tr" sx={{ '& td': { py: 0.5, borderBottom: '1px solid', borderColor: 'grey.100' } }}>
                    <Box component="td">{t.name}</Box>
                    <Box component="td">{t.assigned_hours}</Box>
                    <Box component="td">{t.role_hours}</Box>
                    <Box component="td">{t.must_teach}</Box>
                    <Box component="td">{t.cap}</Box>
                    <Box component="td">
                      {t.over_cap && <Chip size="small" color="error" label="מעל מכסה" />}
                      {t.under_must_teach && <Chip size="small" color="warning" label="פחות מחובה" />}
                      {!t.over_cap && !t.under_must_teach && <Chip size="small" color="success" label="תקין" />}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ── QUALITY DASHBOARD TAB ─────────────────────────────────────────────────

function QualityTab() {
  const [timetables, setTimetables] = useState<any[]>([]);
  const [timetableId, setTimetableId] = useState<number | ''>('');
  const [quality, setQuality] = useState<TimetableQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getTimetables().then((r) => {
      const list = r.data.results ?? [];
      setTimetables(list);
      if (list.length > 0) setTimetableId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!timetableId) return;
    setLoading(true);
    setError('');
    getTimetableQuality(timetableId as number)
      .then((r) => setQuality(r.data))
      .catch((e) => setError(e.response?.data?.error || 'טעינת הנתונים נכשלה'))
      .finally(() => setLoading(false));
  }, [timetableId]);

  if (loading && !quality) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Stack spacing={2.5}>
      <Card>
        <CardContent>
          <TextField
            select size="small" fullWidth
            label="מערכת לבדיקה"
            value={timetableId}
            onChange={(e) => setTimetableId(Number(e.target.value))}
            sx={{ maxWidth: 360 }}
          >
            {timetables.length === 0 && <MenuItem value="" disabled>אין מערכות</MenuItem>}
            {timetables.map((tt: any) => (
              <MenuItem key={tt.id} value={tt.id}>
                {tt.name} — {tt.academic_year} ({tt.status})
              </MenuItem>
            ))}
          </TextField>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {quality && (
        <>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <QualityMetric
              label="סך השיעורים"
              value={quality.totals.entries}
              tone="primary"
            />
            <QualityMetric
              label="חלונות מורים (סך)"
              value={quality.totals.total_teacher_windows}
              hint={`ממוצע ${quality.totals.avg_teacher_windows.toFixed(2)} לכל מורה`}
              tone={
                quality.totals.total_teacher_windows < 30 ? 'good'
                : quality.totals.total_teacher_windows < 100 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label="חלונות כיתות (סך)"
              value={quality.totals.total_class_windows}
              hint={`${quality.totals.classes_with_windows} כיתות מושפעות`}
              tone={
                quality.totals.total_class_windows < 10 ? 'good'
                : quality.totals.total_class_windows < 50 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label="מורים עם חלונות"
              value={quality.totals.teachers_with_windows}
              hint={`מתוך ${quality.teachers.length} מורים`}
            />
            <QualityMetric
              label="שיעורים אחרי 8"
              value={quality.totals.late_period_lessons}
              tone="warn"
            />
          </Stack>

          <Card>
            <CardContent>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1.5 }}>
                15 המורים עם הכי הרבה חלונות
              </Typography>
              <Box sx={{ overflow: 'auto' }}>
                <Box component="table" sx={{ width: '100%', fontSize: 12 }}>
                  <Box component="thead">
                    <Box component="tr" sx={{ '& th': { textAlign: 'right', py: 0.75, borderBottom: '1px solid', borderColor: 'grey.200', fontWeight: 700, fontSize: 11, color: 'grey.600', textTransform: 'uppercase' } }}>
                      <Box component="th">מורה</Box>
                      <Box component="th">שיעורים</Box>
                      <Box component="th">חלונות</Box>
                      <Box component="th">ימי הוראה</Box>
                      <Box component="th">חלונות לפי יום</Box>
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {quality.teachers
                      .filter((t) => t.windows > 0)
                      .slice(0, 15)
                      .map((t) => (
                        <Box key={t.id} component="tr" sx={{ '& td': { py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100' } }}>
                          <Box component="td" sx={{ fontWeight: 600 }}>{t.name}</Box>
                          <Box component="td">{t.lessons}</Box>
                          <Box component="td">
                            <Chip size="small" label={t.windows}
                                  sx={{ height: 18, fontSize: 10,
                                    background: t.windows >= 5 ? 'rgba(244,63,94,0.10)' : 'rgba(245,158,11,0.10)',
                                    color: t.windows >= 5 ? 'error.dark' : '#b45309' }} />
                          </Box>
                          <Box component="td">{t.days_taught}</Box>
                          <Box component="td">
                            {Object.entries(t.windows_by_day).map(([day, count]) => (
                              <Chip key={day} size="small"
                                    label={`${['', 'א', 'ב', 'ג', 'ד', 'ה'][Number(day)]}:${count}`}
                                    sx={{ height: 16, fontSize: 9, mr: 0.5 }} />
                            ))}
                          </Box>
                        </Box>
                      ))}
                    {quality.teachers.filter((t) => t.windows > 0).length === 0 && (
                      <Box component="tr">
                        <Box component="td" colSpan={5} sx={{ py: 3, textAlign: 'center', color: 'grey.500' }}>
                          ✓ אין חלונות אצל אף מורה — מערכת מצוינת!
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                כיתות עם חלונות (פסיכולוגית מקובלים יותר מאשר אצל מורים)
              </Typography>
              <Box sx={{ overflow: 'auto' }}>
                <Box component="table" sx={{ width: '100%', fontSize: 12 }}>
                  <Box component="thead">
                    <Box component="tr" sx={{ '& th': { textAlign: 'right', py: 0.75, borderBottom: '1px solid', borderColor: 'grey.200', fontWeight: 700, fontSize: 11, color: 'grey.600', textTransform: 'uppercase' } }}>
                      <Box component="th">כיתה</Box>
                      <Box component="th">שיעורים</Box>
                      <Box component="th">חלונות</Box>
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {quality.classes.filter((c) => c.windows > 0).slice(0, 15).map((c) => (
                      <Box key={c.id} component="tr" sx={{ '& td': { py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100' } }}>
                        <Box component="td" sx={{ fontWeight: 600 }}>{c.name}</Box>
                        <Box component="td">{c.lessons}</Box>
                        <Box component="td">
                          <Chip size="small" label={c.windows}
                                sx={{ height: 18, fontSize: 10,
                                  background: 'rgba(245,158,11,0.10)', color: '#b45309' }} />
                        </Box>
                      </Box>
                    ))}
                    {quality.classes.filter((c) => c.windows > 0).length === 0 && (
                      <Box component="tr">
                        <Box component="td" colSpan={3} sx={{ py: 3, textAlign: 'center', color: 'grey.500' }}>
                          ✓ אין חלונות אצל אף כיתה
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

function QualityMetric({ label, value, hint, tone }: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad' | 'primary';
}) {
  const palette = {
    good: { bg: 'rgba(16,185,129,0.10)', fg: '#047857' },
    warn: { bg: 'rgba(245,158,11,0.10)', fg: '#b45309' },
    bad: { bg: 'rgba(244,63,94,0.10)', fg: '#be123c' },
    primary: { bg: 'rgba(79,70,229,0.08)', fg: 'primary.dark' },
  }[tone || 'good'];
  return (
    <Box sx={{
      flex: '1 1 180px', minWidth: 180,
      p: 2,
      borderRadius: 2,
      background: palette.bg,
      color: palette.fg,
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1, mt: 0.5 }}>
        {value}
      </Typography>
      {hint && (
        <Typography sx={{ fontSize: 11, opacity: 0.75, mt: 0.5 }}>{hint}</Typography>
      )}
    </Box>
  );
}

function GapCard({ title, count, severity, children }: {
  title: string;
  count: number;
  severity: 'ok' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const palette = {
    ok: { color: 'success.dark', bg: 'success.light' },
    warning: { color: 'warning.dark', bg: 'warning.light' },
    error: { color: 'error.dark', bg: 'error.light' },
  }[severity];

  return (
    <Card sx={{ flex: '1 1 240px', minWidth: 240 }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{title}</Typography>
          <Box sx={{
            px: 1.5, py: 0.25,
            borderRadius: 99,
            background: palette.bg,
            color: palette.color,
            fontSize: 12,
            fontWeight: 700,
          }}>
            {count}
          </Box>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
