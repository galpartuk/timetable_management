import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, LinearProgress, MenuItem, Radio, RadioGroup,
  Stack, TextField, Typography,
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
  { key: 'roundtrip_haarachot', label: 'הערכות (פורמט מקורי)', description: 'ייצוא חזרה לפורמט הקלט — תפקידים + גיליון לכל מקצוע', group: 'master' },
  { key: 'teacher_summary', label: 'סיכום מורים', description: 'מה המערכת הבינה — מורה × מקצוע × כיתה × שעות', group: 'master' },
  { key: 'diagnostics', label: 'אבחון היתכנות', description: 'עומס מול משבצות זמינות — כיתות/מורים בעומס יתר', group: 'master' },

  { key: 'users', label: 'משתמשים', description: 'כל המשתמשים, תפקידים, התחברות אחרונה (super_admin)', group: 'admin' },
  { key: 'audit_logins', label: 'יומן התחברויות', description: '1000 התחברויות אחרונות (super_admin)', group: 'admin' },
  { key: 'audit_activities', label: 'יומן פעולות', description: '1000 פעולות אחרונות (super_admin)', group: 'admin' },
];

const GROUP_TITLES: Record<SheetMeta['group'], string> = {
  timetable: 'מערכת השעות',
  master: 'נתוני בסיס',
  admin: 'ניהול ובקרה',
};

type TabValue = 'export' | 'gaps' | 'quality' | 'manage';

export default function ManagePage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
  const [tab, setTab] = useState<TabValue>('export');

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          {L('ייצוא וניהול נתונים', 'Export & Manage Data')}
        </Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          {L(
            'ייצא נתונים, צפה בפערי נתונים ובאיכות המערכת, או נקה נתונים. פעולות מחיקה הן בלתי-הפיכות. לייבוא קובץ אקסל עברו לעמוד "ייבוא".',
            'Export data, review data gaps and schedule quality, or clear data. Deletions are irreversible. To import an Excel file, use the "Import" page.',
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'inline-flex', gap: 0.5, padding: 0.5, background: 'grey.100', borderRadius: 3, mb: 3 }}>
        <PillTab label={L('פערי נתונים', 'Data gaps')} active={tab === 'gaps'} onClick={() => setTab('gaps')} />
        <PillTab label={L('איכות מערכת', 'Schedule quality')} active={tab === 'quality'} onClick={() => setTab('quality')} />
        <PillTab label={L('ייצוא', 'Export')} active={tab === 'export'} onClick={() => setTab('export')} />
        <PillTab label={L('ניהול נתונים', 'Data admin')} active={tab === 'manage'} onClick={() => setTab('manage')} danger />
      </Box>

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

  const download = async (sheetsOverride?: string[]) => {
    const sheets = sheetsOverride ?? Array.from(selected);
    setDownloading(true);
    setError('');
    try {
      const res = await exportExcel({
        sheets,
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

      {/* One-click: the normalized "what the system understood" workbook —
          per-subject sheets + teacher summary + feasibility diagnostics. */}
      <Card sx={{ border: '1px solid', borderColor: 'primary.light', background: 'rgba(79,70,229,0.03)' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}
                 sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                הורד קובץ מנורמל — מה שהמערכת הבינה
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                גיליון לכל מקצוע (פורמט מקורי) + סיכום מורים + אבחון היתכנות. בדקו, תקנו, וייבאו מחדש.
              </Typography>
            </Box>
            <Button
              variant="contained" size="large"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={downloading}
              onClick={() => download(['diagnostics', 'teacher_summary', 'roundtrip_haarachot'])}
            >
              {downloading ? 'מייצא…' : 'הורד קובץ מנורמל'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

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
              onClick={() => download()}
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
  titleEn: string;
  body: string;
  bodyEn: string;
  buttonLabel: string;
  buttonLabelEn: string;
  icon: ReactElement;
  superAdminOnly?: boolean;
  scope?: 'timetable';   // requires picking a specific timetable
  bulkOperation?: string; // for bulkDelete operations
}

const DANGER_OPS: DangerOp[] = [
  {
    key: 'wipe_everything',
    title: 'מחק את כל הנתונים (איפוס מלא)',
    titleEn: 'Delete ALL data (full reset)',
    body: 'מוחק הכול: מערכות שעות, שיבוצים, אילוצים, תפקידים, תגיות, מורים, מקצועות, כיתות ושכבות. נשארים רק בית הספר ומשבצות הזמן/חדרים. השתמשו לפני ייבוא נקי מאפס.',
    bodyEn: 'Deletes everything: timetables, assignments, constraints, roles, tags, teachers, subjects, classes and grades. Only the school and its time slots/rooms remain. Use this before a clean import from scratch.',
    buttonLabel: 'מחק הכול',
    buttonLabelEn: 'Delete everything',
    icon: <BlockIcon />,
    bulkOperation: 'wipe_everything',
  },
  {
    key: 'delete_one_timetable',
    title: 'מחק מערכת שעות',
    titleEn: 'Delete a timetable',
    body: 'מחיקת מערכת שעות אחת על שיעוריה. הפעולה אינה הפיכה.',
    bodyEn: 'Delete a single timetable and its lessons. This cannot be undone.',
    buttonLabel: 'מחק מערכת',
    buttonLabelEn: 'Delete timetable',
    icon: <DeleteIcon />,
    scope: 'timetable',
  },
  {
    key: 'clear_timetable_entries',
    title: 'נקה שיעורים ממערכת',
    titleEn: 'Clear lessons from a timetable',
    body: 'מסיר את כל השיעורים ממערכת קיימת אך משאיר את המערכת עצמה (סטטוס יחזור ל-DRAFT).',
    bodyEn: 'Removes all lessons from a timetable but keeps the timetable itself (status returns to DRAFT).',
    buttonLabel: 'נקה שיעורים',
    buttonLabelEn: 'Clear lessons',
    icon: <ClearIcon />,
    scope: 'timetable',
  },
  {
    key: 'clear_assignments',
    title: 'נקה את כל שיבוצי ההוראה',
    titleEn: 'Clear all teaching assignments',
    body: 'מסיר את כל ה-TeachingAssignment של בית הספר. בנייה אוטומטית לא תוכל לרוץ עד שיתווספו שיבוצים חדשים.',
    bodyEn: 'Removes every teaching assignment for the school. Generation cannot run until new assignments are added.',
    buttonLabel: 'נקה שיבוצים',
    buttonLabelEn: 'Clear assignments',
    icon: <ClearIcon />,
    bulkOperation: 'clear_assignments',
  },
  {
    key: 'clear_all_timetables',
    title: 'מחק את כל מערכות השעות',
    titleEn: 'Delete all timetables',
    body: 'מוחק את כל המערכות וכל השיעורים שלהן. נתוני בסיס (מורים, מקצועות, כיתות) נשארים.',
    bodyEn: 'Deletes every timetable and all their lessons. Master data (teachers, subjects, classes) is kept.',
    buttonLabel: 'מחק את כל המערכות',
    buttonLabelEn: 'Delete all timetables',
    icon: <DeleteIcon />,
    bulkOperation: 'clear_all_timetables',
  },
  {
    key: 'clear_subjects',
    title: 'נקה מקצועות',
    titleEn: 'Clear subjects',
    body: 'מוחק את כל המקצועות. ייכשל אם הם בשימוש בשיבוצים או בשיעורים — נקה אותם קודם.',
    bodyEn: 'Deletes all subjects. Fails if they are referenced by assignments or lessons — clear those first.',
    buttonLabel: 'נקה מקצועות',
    buttonLabelEn: 'Clear subjects',
    icon: <ClearIcon />,
    bulkOperation: 'clear_subjects',
  },
  {
    key: 'clear_teachers',
    title: 'נקה מורים',
    titleEn: 'Clear teachers',
    body: 'מוחק את כל המורים. ייכשל אם הם בשימוש בשיבוצים או בשיעורים — נקה אותם קודם.',
    bodyEn: 'Deletes all teachers. Fails if they are referenced by assignments or lessons — clear those first.',
    buttonLabel: 'נקה מורים',
    buttonLabelEn: 'Clear teachers',
    icon: <ClearIcon />,
    bulkOperation: 'clear_teachers',
  },
  {
    key: 'wipe_school_data',
    title: 'אפס את נתוני התזמון (Super Admin)',
    titleEn: 'Reset scheduling data (Super Admin)',
    body: 'מוחק את כל המערכות, השיעורים, שיבוצי ההוראה והאילוצים. נתוני בסיס (מורים, מקצועות, כיתות, משבצות זמן, חדרים) נשארים.',
    bodyEn: 'Deletes all timetables, lessons, assignments and constraints. Master data (teachers, subjects, classes, time slots, rooms) is kept.',
    buttonLabel: 'אפס',
    buttonLabelEn: 'Reset',
    icon: <BlockIcon />,
    superAdminOnly: true,
    bulkOperation: 'wipe_school_data',
  },
];

function ManageTab() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
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
        <strong>{L('אזור מסוכן.', 'Danger zone.')}</strong>{' '}
        {L('הפעולות בעמוד הזה אינן הפיכות. ודא שיש לך גיבוי לפני שתבצע מחיקות מסיביות.',
           'Actions on this page are irreversible. Make sure you have a backup before bulk deletions.')}
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
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{isRtl ? op.title : op.titleEn}</Typography>
                    {op.superAdminOnly && (
                      <Chip size="small" icon={<ShieldIcon sx={{ fontSize: 12 }} />} label="super_admin"
                            sx={{ height: 20, fontSize: 11, background: 'rgba(79,70,229,0.10)', color: 'primary.dark' }} />
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: 'grey.700', mb: 1.5 }}>{isRtl ? op.body : op.bodyEn}</Typography>
                  <DangerLauncher
                    op={op}
                    timetables={timetables}
                    blocked={blocked}
                    isRtl={isRtl}
                    onLaunch={(timetableId) => setConfirm({ op, timetableId })}
                  />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!confirm} onClose={() => !working && setConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{L('אישור פעולה הרסנית', 'Confirm destructive action')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <strong>{confirm ? (isRtl ? confirm.op.title : confirm.op.titleEn) : ''}</strong>
            <Box component="span" sx={{ display: 'block', mt: 1, color: 'grey.700' }}>
              {confirm ? (isRtl ? confirm.op.body : confirm.op.bodyEn) : ''}
            </Box>
          </DialogContentText>
          <Divider sx={{ my: 2 }} />
          <DialogContentText sx={{ color: 'error.dark' }}>
            {L('הפעולה אינה הפיכה. האם להמשיך?', 'This cannot be undone. Continue?')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={working}>{L('ביטול', 'Cancel')}</Button>
          <Button
            variant="contained" color="error"
            onClick={run} disabled={working}
            startIcon={working ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {L('כן, בצע מחיקה', 'Yes, delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function DangerLauncher({ op, timetables, blocked, isRtl, onLaunch }: {
  op: DangerOp;
  timetables: any[];
  blocked: boolean | undefined;
  isRtl: boolean;
  onLaunch: (timetableId?: number) => void;
}) {
  const [tid, setTid] = useState<number | ''>('');
  const buttonLabel = isRtl ? op.buttonLabel : op.buttonLabelEn;

  if (blocked) {
    return (
      <Button size="small" variant="outlined" disabled startIcon={<BlockIcon fontSize="small" />}>
        {isRtl ? 'דרושה הרשאת super_admin' : 'Requires super_admin'}
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
          <MenuItem value="" disabled>{isRtl ? 'בחר מערכת' : 'Pick a timetable'}</MenuItem>
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
          {buttonLabel}
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
      {buttonLabel}
    </Button>
  );
}

function DiffStat({ label, value, tone }: {
  label: string; value: number; tone: 'good' | 'warn';
}) {
  const colors = tone === 'good'
    ? { bg: 'rgba(16,185,129,0.10)', fg: '#047857' }
    : { bg: 'rgba(245,158,11,0.10)', fg: '#b45309' };
  return (
    <Box sx={{
      px: 1.25, py: 0.75, borderRadius: 2,
      background: colors.bg, color: colors.fg,
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{value}</Typography>
    </Box>
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
            הבנייה האוטומטית תדלג עליהם.
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

type TeacherSortKey =
  | 'name' | 'lessons' | 'windows' | 'long_windows' | 'max_single_gap'
  | 'days_taught' | 'days_with_windows' | 'longest_teaching_day'
  | 'max_daily_lessons' | 'avg_daily_lessons' | 'late_period_lessons'
  | 'first_period_count' | 'distinct_subjects' | 'distinct_classes'
  | 'bagrut_hours' | 'role_hours' | 'total_contract_hours' | 'utilization_pct';

function QualityTab() {
  const navigate = useNavigate();
  const [timetables, setTimetables] = useState<any[]>([]);
  const [timetableId, setTimetableId] = useState<number | ''>('');
  const [quality, setQuality] = useState<TimetableQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<TeacherSortKey>('windows');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [minWindowsFilter, setMinWindowsFilter] = useState<number>(0);

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

  const sortedTeachers = useMemo(() => {
    if (!quality) return [];
    let list = quality.teachers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (minWindowsFilter > 0) {
      list = list.filter((t) => t.windows >= minWindowsFilter);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') return dir * av.localeCompare(bv, 'he');
      return dir * ((av ?? 0) - (bv ?? 0));
    });
  }, [quality, search, sortKey, sortDir, minWindowsFilter]);

  const onSort = (key: TeacherSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const exportCsv = () => {
    if (!quality) return;
    const headers = [
      'שם המורה', 'שעות הוראה', 'שעות בגרות', 'שעות תפקיד',
      'סך הכל שעות', 'מכסה', 'ניצול (%)',
      'חלונות', 'חלונות ארוכים', 'פער מקס׳',
      'ימי הוראה', 'ימים עם חלונות',
      'יום הוראה ארוך', 'מקס׳ ליום', 'ממוצע ליום',
      'שיעורים אחרי 8', 'ימים פותחים', 'מקצועות', 'כיתות', 'גמול תפקיד', 'יום חופש',
    ];
    const dayNames: Record<number, string> = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה' };
    const rows = sortedTeachers.map((t) => [
      t.name, t.lessons, t.bagrut_hours, t.role_hours,
      t.total_contract_hours, t.cap, t.utilization_pct,
      t.windows, t.long_windows, t.max_single_gap,
      t.days_taught, t.days_with_windows,
      t.longest_teaching_day, t.max_daily_lessons, t.avg_daily_lessons,
      t.late_period_lessons, t.first_period_count,
      t.distinct_subjects, t.distinct_classes, t.stipend_fraction,
      t.day_off ? dayNames[t.day_off] : '',
    ]);
    const csv = '﻿' + [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teacher_quality_${quality.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !quality) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Stack spacing={2.5}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <TextField
              select size="small"
              label="מערכת לבדיקה"
              value={timetableId}
              onChange={(e) => setTimetableId(Number(e.target.value))}
              sx={{ minWidth: 320 }}
            >
              {timetables.length === 0 && <MenuItem value="" disabled>אין מערכות</MenuItem>}
              {timetables.map((tt: any) => (
                <MenuItem key={tt.id} value={tt.id}>
                  {tt.name} — {tt.academic_year} ({tt.status})
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                    disabled={!quality} onClick={exportCsv}>
              ייצא טבלה ל-CSV
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {quality && <DataQualityIssues quality={quality} />}

      {quality && (
        <>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <QualityMetric label="סך השיעורים" value={quality.totals.entries} tone="primary" />
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
              label={`חלונות ארוכים (${quality.long_window_threshold}+ שעות)`}
              value={quality.totals.total_long_windows}
              hint={`${quality.totals.teachers_with_long_windows} מורים מושפעים`}
              tone={
                quality.totals.total_long_windows === 0 ? 'good'
                : quality.totals.total_long_windows < 5 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label="חלונות כיתות (סך)"
              value={quality.totals.total_class_windows}
              hint={`${quality.totals.classes_with_windows} כיתות`}
              tone={
                quality.totals.total_class_windows < 10 ? 'good'
                : quality.totals.total_class_windows < 50 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label="מורים עם חלונות"
              value={quality.totals.teachers_with_windows}
              hint={`מתוך ${quality.teachers.length}`}
            />
            <QualityMetric
              label="שיעורים אחרי 8"
              value={quality.totals.late_period_lessons}
              tone="warn"
            />
          </Stack>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}
                     sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', mb: 2 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  טבלת מורים — {sortedTeachers.length} מתוך {quality.teachers.length}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small" placeholder="חיפוש מורה…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ width: 200 }}
                  />
                  <TextField
                    select size="small" value={minWindowsFilter}
                    onChange={(e) => setMinWindowsFilter(Number(e.target.value))}
                    sx={{ width: 160 }}
                  >
                    <MenuItem value={0}>כל המורים</MenuItem>
                    <MenuItem value={1}>עם 1+ חלונות</MenuItem>
                    <MenuItem value={3}>עם 3+ חלונות</MenuItem>
                    <MenuItem value={5}>עם 5+ חלונות</MenuItem>
                  </TextField>
                </Stack>
              </Stack>

              <Box sx={{ overflow: 'auto', maxHeight: 700 }}>
                <Box component="table" sx={{
                  width: '100%', fontSize: 12, borderCollapse: 'separate', borderSpacing: 0,
                }}>
                  <Box component="thead" sx={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff' }}>
                    <Box component="tr" sx={{
                      '& th': {
                        textAlign: 'right', py: 1, px: 1,
                        borderBottom: '2px solid', borderColor: 'grey.300',
                        fontWeight: 700, fontSize: 10, color: 'grey.700',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        whiteSpace: 'nowrap', cursor: 'pointer',
                        userSelect: 'none', background: '#fff',
                      },
                    }}>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="name" onSort={onSort}>מורה</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="lessons" onSort={onSort}>שעות הוראה</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="bagrut_hours" onSort={onSort}>שעות בגרות</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="role_hours" onSort={onSort}>שעות תפקיד</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="total_contract_hours" onSort={onSort}>סך הכל</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="utilization_pct" onSort={onSort}>ניצול %</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="windows" onSort={onSort}>חלונות</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="long_windows" onSort={onSort}>חלונות ארוכים</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="max_single_gap" onSort={onSort}>פער מקס׳</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="days_taught" onSort={onSort}>ימי הוראה</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="longest_teaching_day" onSort={onSort}>יום ארוך</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="max_daily_lessons" onSort={onSort}>מקס׳ ליום</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="avg_daily_lessons" onSort={onSort}>ממוצע ליום</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="late_period_lessons" onSort={onSort}>אחרי 8</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="first_period_count" onSort={onSort}>פותח יום</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="distinct_subjects" onSort={onSort}>מקצועות</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="distinct_classes" onSort={onSort}>כיתות</SortableTh>
                      <Box component="th">חופש</Box>
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {sortedTeachers.map((t) => (
                      <TeacherRow key={t.id} t={t}
                        onClick={() => navigate(`/timetable?teacher=${t.id}&timetable=${timetableId}`)}
                      />
                    ))}
                    {sortedTeachers.length === 0 && (
                      <Box component="tr">
                        <Box component="td" colSpan={15} sx={{ py: 4, textAlign: 'center', color: 'grey.500' }}>
                          {search ? 'אין תוצאות חיפוש' : '✓ אין מורים שעוברים את הסינון'}
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
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>כיתות עם חלונות</Typography>
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

function DataQualityIssues({ quality }: { quality: TimetableQuality }) {
  const issues = useMemo(() => {
    const list: Array<{
      severity: 'error' | 'warning' | 'info';
      title: string;
      detail: string;
    }> = [];

    const overCap = quality.teachers.filter((t) => t.utilization_pct > 100);
    if (overCap.length > 0) {
      list.push({
        severity: 'error',
        title: `${overCap.length} מורים מעל המכסה (>100% ניצול)`,
        detail: overCap.slice(0, 5).map((t) =>
          `${t.name} — ${t.utilization_pct}%`).join(' · ')
          + (overCap.length > 5 ? ` · +${overCap.length - 5} נוספים` : ''),
      });
    }

    const longGaps = quality.teachers.filter((t) => t.long_windows > 0);
    if (longGaps.length > 0) {
      list.push({
        severity: 'error',
        title: `${longGaps.length} מורים עם חלון של ${quality.long_window_threshold}+ שעות`,
        detail: longGaps.slice(0, 5).map((t) =>
          `${t.name} — פער ${t.max_single_gap}`).join(' · '),
      });
    }

    const tooFewLessons = quality.classes.filter((c) => c.lessons < 25);
    if (tooFewLessons.length > 0) {
      list.push({
        severity: 'warning',
        title: `${tooFewLessons.length} כיתות עם פחות מ-25 שיעורים שבועיים`,
        detail: tooFewLessons.slice(0, 8).map((c) =>
          `${c.name} (${c.lessons})`).join(' · '),
      });
    }

    const tooManyLessons = quality.classes.filter((c) => c.lessons > 45);
    if (tooManyLessons.length > 0) {
      list.push({
        severity: 'warning',
        title: `${tooManyLessons.length} כיתות עם מעל 45 שיעורים שבועיים`,
        detail: tooManyLessons.slice(0, 8).map((c) =>
          `${c.name} (${c.lessons})`).join(' · '),
      });
    }

    const teacherSingleClass = quality.teachers.filter(
      (t) => t.lessons > 10 && t.distinct_classes === 1
    );
    if (teacherSingleClass.length > 0) {
      list.push({
        severity: 'info',
        title: `${teacherSingleClass.length} מורים עם 10+ שעות בכיתה אחת בלבד`,
        detail: 'יש לבדוק אם הנתון נכון (יתכנו בעיות בייבוא)',
      });
    }

    return list;
  }, [quality]);

  if (issues.length === 0) {
    return (
      <Alert severity="success" sx={{ mb: 0 }}>
        ✓ לא נמצאו בעיות בנתונים — המערכת נראית מאוזנת
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1.5 }}>
          בעיות שזוהו ({issues.length})
        </Typography>
        <Stack spacing={1}>
          {issues.map((iss, i) => (
            <Alert key={i} severity={iss.severity} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{iss.title}</Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.700' }}>{iss.detail}</Typography>
            </Alert>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SortableTh({
  k, sortKey, sortDir, onSort, children,
}: {
  k: TeacherSortKey;
  sortKey: TeacherSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: TeacherSortKey) => void;
  children: React.ReactNode;
}) {
  const isActive = sortKey === k;
  const arrow = isActive ? (sortDir === 'asc' ? '↑' : '↓') : '';
  return (
    <Box
      component="th"
      onClick={() => onSort(k)}
      sx={{
        color: isActive ? 'primary.dark' : 'grey.700',
        '&:hover': { color: 'primary.dark', background: 'grey.50' },
      }}
    >
      {children} {arrow}
    </Box>
  );
}

function TeacherRow({ t, onClick }: {
  t: import('../../api/client').TeacherQualityRow;
  onClick?: () => void;
}) {
  const dayNames: Record<number, string> = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה' };
  // Color the windows cell by severity.
  const winColor = t.windows === 0 ? 'success.dark'
    : t.windows >= 5 ? 'error.dark'
    : t.windows >= 3 ? '#b45309' : '#854d0e';
  const winBg = t.windows === 0 ? 'rgba(16,185,129,0.10)'
    : t.windows >= 5 ? 'rgba(244,63,94,0.10)'
    : t.windows >= 3 ? 'rgba(245,158,11,0.10)' : 'rgba(250,204,21,0.10)';

  const longWinColor = t.long_windows === 0 ? 'success.dark' : 'error.dark';
  const longWinBg = t.long_windows === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.10)';

  // Color the utilization cell by how close to cap it is.
  const utilColor =
    t.utilization_pct >= 100 ? 'error.dark'
    : t.utilization_pct >= 90 ? '#b45309'
    : t.utilization_pct >= 70 ? 'success.dark' : 'grey.700';
  const utilBg =
    t.utilization_pct >= 100 ? 'rgba(244,63,94,0.10)'
    : t.utilization_pct >= 90 ? 'rgba(245,158,11,0.10)'
    : t.utilization_pct >= 70 ? 'rgba(16,185,129,0.08)' : 'transparent';

  return (
    <Box component="tr" onClick={onClick} sx={{
      '& td': {
        py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'grey.100',
        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      },
      cursor: onClick ? 'pointer' : 'default',
      '&:hover': { background: 'grey.50' },
    }}>
      <Box component="td" sx={{ fontWeight: 600, position: 'sticky', insetInlineStart: 0, background: 'inherit' }}>
        {t.name}
      </Box>
      <Box component="td">{t.lessons}</Box>
      <Box component="td">{t.bagrut_hours || '—'}</Box>
      <Box component="td">{t.role_hours || '—'}</Box>
      <Box component="td" sx={{ fontWeight: 600 }}>{t.total_contract_hours}</Box>
      <Box component="td">
        <Chip size="small" label={`${t.utilization_pct}%`}
              sx={{ height: 20, fontSize: 11, fontWeight: 700,
                background: utilBg, color: utilColor }} />
      </Box>
      <Box component="td">
        <Chip size="small" label={t.windows}
              sx={{ height: 20, fontSize: 11, fontWeight: 700,
                background: winBg, color: winColor }} />
      </Box>
      <Box component="td">
        <Chip size="small" label={t.long_windows}
              sx={{ height: 20, fontSize: 11, fontWeight: 700,
                background: longWinBg, color: longWinColor }} />
      </Box>
      <Box component="td">{t.max_single_gap || '—'}</Box>
      <Box component="td">{t.days_taught}</Box>
      <Box component="td">{t.longest_teaching_day}</Box>
      <Box component="td">{t.max_daily_lessons}</Box>
      <Box component="td">{t.avg_daily_lessons.toFixed(1)}</Box>
      <Box component="td">{t.late_period_lessons || '—'}</Box>
      <Box component="td">{t.first_period_count}</Box>
      <Box component="td">{t.distinct_subjects}</Box>
      <Box component="td">{t.distinct_classes}</Box>
      <Box component="td">{t.day_off ? dayNames[t.day_off] : '—'}</Box>
    </Box>
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
