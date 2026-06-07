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
type SheetMeta = { key: string; label: string; labelEn: string; description: string; descriptionEn: string; group: 'timetable' | 'master' | 'admin' };
const SHEETS: SheetMeta[] = [
  { key: 'timetable_by_class', label: 'מערכת לפי כיתה', labelEn: 'Timetable by class', description: 'עמוד נפרד לכל כיתה — ימים × שיעורים', descriptionEn: 'A separate sheet per class — days × periods', group: 'timetable' },
  { key: 'timetable_by_teacher', label: 'מערכת לפי מורה', labelEn: 'Timetable by teacher', description: 'עמוד נפרד לכל מורה — ימים × שיעורים', descriptionEn: 'A separate sheet per teacher — days × periods', group: 'timetable' },
  { key: 'timetable_flat', label: 'כל השיעורים (טבלה אחת)', labelEn: 'All lessons (single table)', description: 'כל השורות במערכת בעמוד אחד', descriptionEn: 'Every row of the timetable on one sheet', group: 'timetable' },
  { key: 'conflicts', label: 'התנגשויות', labelEn: 'Conflicts', description: 'מורה/כיתה/חדר משובצים פעמיים באותה משבצת', descriptionEn: 'Teacher/class/room scheduled twice in the same slot', group: 'timetable' },

  { key: 'teachers', label: 'מורים', labelEn: 'Teachers', description: 'שמות, אימייל, טלפון, מקס שעות, יום חופש', descriptionEn: 'Names, email, phone, max hours, day off', group: 'master' },
  { key: 'subjects', label: 'מקצועות', labelEn: 'Subjects', description: 'שם בעברית/אנגלית, צבע', descriptionEn: 'Hebrew/English name, color', group: 'master' },
  { key: 'classes', label: 'כיתות', labelEn: 'Classes', description: 'שכבה, מספר, סוג, מספר תלמידים', descriptionEn: 'Grade, number, type, student count', group: 'master' },
  { key: 'time_slots', label: 'משבצות זמן', labelEn: 'Time slots', description: 'יום ושיעור עם זמני התחלה וסיום', descriptionEn: 'Day and period with start and end times', group: 'master' },
  { key: 'rooms', label: 'חדרים', labelEn: 'Rooms', description: 'שם, קיבולת, סוג', descriptionEn: 'Name, capacity, type', group: 'master' },
  { key: 'assignments', label: 'שיבוצי הוראה', labelEn: 'Teaching assignments', description: 'מי מלמד מה למי וכמה שעות', descriptionEn: 'Who teaches what to whom and how many hours', group: 'master' },
  { key: 'constraints', label: 'אילוצים', labelEn: 'Constraints', description: 'אילוצים מוגדרים: סוג, עדיפות, פרמטרים', descriptionEn: 'Defined constraints: type, priority, parameters', group: 'master' },
  { key: 'import_logs', label: 'יומן ייבואים', labelEn: 'Import log', description: '200 הייבואים האחרונים', descriptionEn: 'The 200 most recent imports', group: 'master' },
  { key: 'roundtrip_haarachot', label: 'הערכות (פורמט מקורי)', labelEn: 'Assessments (original format)', description: 'ייצוא חזרה לפורמט הקלט — תפקידים + גיליון לכל מקצוע', descriptionEn: 'Export back to the input format — roles + a sheet per subject', group: 'master' },
  { key: 'teacher_summary', label: 'סיכום מורים', labelEn: 'Teacher summary', description: 'מה המערכת הבינה — מורה × מקצוע × כיתה × שעות', descriptionEn: 'What the system understood — teacher × subject × class × hours', group: 'master' },
  { key: 'diagnostics', label: 'אבחון היתכנות', labelEn: 'Feasibility diagnostics', description: 'עומס מול משבצות זמינות — כיתות/מורים בעומס יתר', descriptionEn: 'Load vs. available slots — overloaded classes/teachers', group: 'master' },

  { key: 'users', label: 'משתמשים', labelEn: 'Users', description: 'כל המשתמשים, תפקידים, התחברות אחרונה (super_admin)', descriptionEn: 'All users, roles, last login (super_admin)', group: 'admin' },
  { key: 'audit_logins', label: 'יומן התחברויות', labelEn: 'Login log', description: '1000 התחברויות אחרונות (super_admin)', descriptionEn: 'The 1000 most recent logins (super_admin)', group: 'admin' },
  { key: 'audit_activities', label: 'יומן פעולות', labelEn: 'Activity log', description: '1000 פעולות אחרונות (super_admin)', descriptionEn: 'The 1000 most recent activities (super_admin)', group: 'admin' },
];

const GROUP_TITLES: Record<SheetMeta['group'], { he: string; en: string }> = {
  timetable: { he: 'מערכת השעות', en: 'Timetable' },
  master: { he: 'נתוני בסיס', en: 'Master data' },
  admin: { he: 'ניהול ובקרה', en: 'Administration & audit' },
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
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
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
      let msg = L('הייצוא נכשל', 'Export failed');
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
                {L('הורד קובץ מנורמל — מה שהמערכת הבינה', 'Download normalized file — what the system understood')}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                {L(
                  'גיליון לכל מקצוע (פורמט מקורי) + סיכום מורים + אבחון היתכנות. בדקו, תקנו, וייבאו מחדש.',
                  'A sheet per subject (original format) + teacher summary + feasibility diagnostics. Review, fix, and re-import.',
                )}
              </Typography>
            </Box>
            <Button
              variant="contained" size="large"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={downloading}
              onClick={() => download(['diagnostics', 'teacher_summary', 'roundtrip_haarachot'])}
            >
              {downloading ? L('מייצא…', 'Exporting…') : L('הורד קובץ מנורמל', 'Download normalized file')}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {needsTimetable && (
        <Card>
          <CardContent>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 1 }}>
              {L('מערכת לייצוא (לעמודי מערכת השעות)', 'Timetable to export (for timetable sheets)')}
            </Typography>
            <TextField
              select size="small" fullWidth
              value={timetableId}
              onChange={(e) => setTimetableId(Number(e.target.value))}
              sx={{ maxWidth: 360 }}
            >
              {timetables.length === 0 && <MenuItem value="" disabled>{L('אין מערכות', 'No timetables')}</MenuItem>}
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
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{isRtl ? GROUP_TITLES[group].he : GROUP_TITLES[group].en}</Typography>
                <Button
                  size="small" variant="text"
                  onClick={() => toggleGroup(group, allChecked)}
                >
                  {allChecked ? L('נקה הכול', 'Clear all') : L('בחר הכול', 'Select all')}
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
                            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{isRtl ? s.label : s.labelEn}</Typography>
                            {requiresAdmin && (
                              <Chip size="small" icon={<ShieldIcon sx={{ fontSize: 12 }} />} label="super_admin"
                                    sx={{ height: 18, fontSize: 10, background: 'rgba(79,70,229,0.10)', color: 'primary.dark' }} />
                            )}
                          </Stack>
                          <Typography sx={{ fontSize: 12, color: 'grey.600' }}>{isRtl ? s.description : s.descriptionEn}</Typography>
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
                {selected.size === 0
                  ? L('בחר לפחות עמוד אחד לייצוא', 'Select at least one sheet to export')
                  : L(`${selected.size} עמודים נבחרו`, `${selected.size} sheets selected`)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.600' }}>
                {L('הקובץ יורד ישירות לדפדפן.', 'The file downloads directly to your browser.')}
              </Typography>
            </Box>
            <Button
              variant="contained" size="large"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              disabled={selected.size === 0 || downloading || (needsTimetable && !timetableId)}
              onClick={() => download()}
            >
              {downloading ? L('מייצא…', 'Exporting…') : L('הורד אקסל', 'Download Excel')}
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
      setError(e.response?.data?.error || L('הפעולה נכשלה', 'The operation failed'));
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
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
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
      setError(e.response?.data?.error || L('טעינת הנתונים נכשלה', 'Failed to load data'));
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
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{L('סיכום מצב הנתונים', 'Data status summary')}</Typography>
        <Button size="small" onClick={load} disabled={loading}>{L('רענן', 'Refresh')}</Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
        <GapCard
          title={L('כיתות ללא מחנכ/ת', 'Classes without a homeroom teacher')}
          count={data.classes_missing_homeroom_count}
          severity={data.classes_missing_homeroom_count > 0 ? 'warning' : 'ok'}
        >
          {data.classes_missing_homeroom.slice(0, 30).map((c) => (
            <Chip key={c.id} size="small" label={`${c.grade__name}${c.number}`} sx={{ mr: 0.5, mb: 0.5 }} />
          ))}
        </GapCard>

        <GapCard
          title={L('שיבוצים ללא מורה', 'Assignments without a teacher')}
          count={data.assignments_without_teacher_count}
          severity={data.assignments_without_teacher_count > 0 ? 'warning' : 'ok'}
        >
          <Typography sx={{ fontSize: 12, color: 'grey.700' }}>
            {L(
              `${data.assignments_without_teacher_count} שיעורים ללא מורה מוקצה. הבנייה האוטומטית תדלג עליהם.`,
              `${data.assignments_without_teacher_count} lessons have no assigned teacher. Auto-generation will skip them.`,
            )}
          </Typography>
        </GapCard>

        <GapCard
          title={L('מורים מעל מכסה', 'Teachers over their cap')}
          count={overCap.length}
          severity={overCap.length > 0 ? 'error' : 'ok'}
        >
          {overCap.slice(0, 20).map((t) => (
            <Typography key={t.id} sx={{ fontSize: 12 }}>
              {t.name}: {t.assigned_hours}h / {L('מקס', 'max')} {t.cap}h
            </Typography>
          ))}
        </GapCard>

        <GapCard
          title={L('מורים פחות מחובת ההוראה', 'Teachers below their teaching duty')}
          count={underTaught.length}
          severity={underTaught.length > 0 ? 'warning' : 'ok'}
        >
          {underTaught.slice(0, 20).map((t) => (
            <Typography key={t.id} sx={{ fontSize: 12 }}>
              {t.name}: {t.assigned_hours}h / {L('חובה', 'required')} {t.must_teach}h
            </Typography>
          ))}
        </GapCard>
      </Stack>

      <Card>
        <CardContent>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
            {L('עומס מורים (Top 30)', 'Teacher load (Top 30)')}
          </Typography>
          <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
            <Box component="table" sx={{ width: '100%', fontSize: 12 }}>
              <Box component="thead">
                <Box component="tr" sx={{ '& th': { textAlign: 'right', py: 0.5, borderBottom: '1px solid', borderColor: 'grey.200', fontWeight: 700 } }}>
                  <Box component="th">{L('מורה', 'Teacher')}</Box>
                  <Box component="th">{L('שעות הוראה', 'Teaching hours')}</Box>
                  <Box component="th">{L('שעות תפקיד', 'Role hours')}</Box>
                  <Box component="th">{L('חובת הוראה', 'Teaching duty')}</Box>
                  <Box component="th">{L('מכסה', 'Cap')}</Box>
                  <Box component="th">{L('סטטוס', 'Status')}</Box>
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
                      {t.over_cap && <Chip size="small" color="error" label={L('מעל מכסה', 'Over cap')} />}
                      {t.under_must_teach && <Chip size="small" color="warning" label={L('פחות מחובה', 'Below duty')} />}
                      {!t.over_cap && !t.under_must_teach && <Chip size="small" color="success" label={L('תקין', 'OK')} />}
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
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
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
      .catch((e) => setError(e.response?.data?.error || L('טעינת הנתונים נכשלה', 'Failed to load data')))
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
    const headers = isRtl ? [
      'שם המורה', 'שעות הוראה', 'שעות בגרות', 'שעות תפקיד',
      'סך הכל שעות', 'מכסה', 'ניצול (%)',
      'חלונות', 'חלונות ארוכים', 'פער מקס׳',
      'ימי הוראה', 'ימים עם חלונות',
      'יום הוראה ארוך', 'מקס׳ ליום', 'ממוצע ליום',
      'שיעורים אחרי 8', 'ימים פותחים', 'מקצועות', 'כיתות', 'גמול תפקיד', 'יום חופש',
    ] : [
      'Teacher name', 'Teaching hours', 'Bagrut hours', 'Role hours',
      'Total hours', 'Cap', 'Utilization (%)',
      'Windows', 'Long windows', 'Max gap',
      'Days taught', 'Days with windows',
      'Longest teaching day', 'Max per day', 'Avg per day',
      'Lessons after 8', 'Days opened', 'Subjects', 'Classes', 'Role stipend', 'Day off',
    ];
    const dayNames: Record<number, string> = isRtl
      ? { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה' }
      : { 1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu' };
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
              label={L('מערכת לבדיקה', 'Timetable to inspect')}
              value={timetableId}
              onChange={(e) => setTimetableId(Number(e.target.value))}
              sx={{ minWidth: 320 }}
            >
              {timetables.length === 0 && <MenuItem value="" disabled>{L('אין מערכות', 'No timetables')}</MenuItem>}
              {timetables.map((tt: any) => (
                <MenuItem key={tt.id} value={tt.id}>
                  {tt.name} — {tt.academic_year} ({tt.status})
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                    disabled={!quality} onClick={exportCsv}>
              {L('ייצא טבלה ל-CSV', 'Export table to CSV')}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {quality && <DataQualityIssues quality={quality} />}

      {quality && (
        <>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <QualityMetric label={L('סך השיעורים', 'Total lessons')} value={quality.totals.entries} tone="primary" />
            <QualityMetric
              label={L('חלונות מורים (סך)', 'Teacher windows (total)')}
              value={quality.totals.total_teacher_windows}
              hint={L(
                `ממוצע ${quality.totals.avg_teacher_windows.toFixed(2)} לכל מורה`,
                `${quality.totals.avg_teacher_windows.toFixed(2)} avg per teacher`,
              )}
              tone={
                quality.totals.total_teacher_windows < 30 ? 'good'
                : quality.totals.total_teacher_windows < 100 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label={L(
                `חלונות ארוכים (${quality.long_window_threshold}+ שעות)`,
                `Long windows (${quality.long_window_threshold}+ hours)`,
              )}
              value={quality.totals.total_long_windows}
              hint={L(
                `${quality.totals.teachers_with_long_windows} מורים מושפעים`,
                `${quality.totals.teachers_with_long_windows} teachers affected`,
              )}
              tone={
                quality.totals.total_long_windows === 0 ? 'good'
                : quality.totals.total_long_windows < 5 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label={L('חלונות כיתות (סך)', 'Class windows (total)')}
              value={quality.totals.total_class_windows}
              hint={L(
                `${quality.totals.classes_with_windows} כיתות`,
                `${quality.totals.classes_with_windows} classes`,
              )}
              tone={
                quality.totals.total_class_windows < 10 ? 'good'
                : quality.totals.total_class_windows < 50 ? 'warn' : 'bad'
              }
            />
            <QualityMetric
              label={L('מורים עם חלונות', 'Teachers with windows')}
              value={quality.totals.teachers_with_windows}
              hint={L(`מתוך ${quality.teachers.length}`, `of ${quality.teachers.length}`)}
            />
            <QualityMetric
              label={L('שיעורים אחרי 8', 'Lessons after period 8')}
              value={quality.totals.late_period_lessons}
              tone="warn"
            />
          </Stack>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}
                     sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', mb: 2 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  {L(
                    `טבלת מורים — ${sortedTeachers.length} מתוך ${quality.teachers.length}`,
                    `Teacher table — ${sortedTeachers.length} of ${quality.teachers.length}`,
                  )}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small" placeholder={L('חיפוש מורה…', 'Search teacher…')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ width: 200 }}
                  />
                  <TextField
                    select size="small" value={minWindowsFilter}
                    onChange={(e) => setMinWindowsFilter(Number(e.target.value))}
                    sx={{ width: 160 }}
                  >
                    <MenuItem value={0}>{L('כל המורים', 'All teachers')}</MenuItem>
                    <MenuItem value={1}>{L('עם 1+ חלונות', 'With 1+ windows')}</MenuItem>
                    <MenuItem value={3}>{L('עם 3+ חלונות', 'With 3+ windows')}</MenuItem>
                    <MenuItem value={5}>{L('עם 5+ חלונות', 'With 5+ windows')}</MenuItem>
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
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="name" onSort={onSort}>{L('מורה', 'Teacher')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="lessons" onSort={onSort}>{L('שעות הוראה', 'Teaching hours')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="bagrut_hours" onSort={onSort}>{L('שעות בגרות', 'Bagrut hours')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="role_hours" onSort={onSort}>{L('שעות תפקיד', 'Role hours')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="total_contract_hours" onSort={onSort}>{L('סך הכל', 'Total')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="utilization_pct" onSort={onSort}>{L('ניצול %', 'Util %')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="windows" onSort={onSort}>{L('חלונות', 'Windows')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="long_windows" onSort={onSort}>{L('חלונות ארוכים', 'Long windows')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="max_single_gap" onSort={onSort}>{L('פער מקס׳', 'Max gap')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="days_taught" onSort={onSort}>{L('ימי הוראה', 'Days taught')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="longest_teaching_day" onSort={onSort}>{L('יום ארוך', 'Longest day')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="max_daily_lessons" onSort={onSort}>{L('מקס׳ ליום', 'Max/day')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="avg_daily_lessons" onSort={onSort}>{L('ממוצע ליום', 'Avg/day')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="late_period_lessons" onSort={onSort}>{L('אחרי 8', 'After 8')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="first_period_count" onSort={onSort}>{L('פותח יום', 'Opens day')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="distinct_subjects" onSort={onSort}>{L('מקצועות', 'Subjects')}</SortableTh>
                      <SortableTh sortKey={sortKey} sortDir={sortDir} k="distinct_classes" onSort={onSort}>{L('כיתות', 'Classes')}</SortableTh>
                      <Box component="th">{L('חופש', 'Off')}</Box>
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
                          {search ? L('אין תוצאות חיפוש', 'No search results') : L('✓ אין מורים שעוברים את הסינון', '✓ No teachers match the filter')}
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
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>{L('כיתות עם חלונות', 'Classes with windows')}</Typography>
              <Box sx={{ overflow: 'auto' }}>
                <Box component="table" sx={{ width: '100%', fontSize: 12 }}>
                  <Box component="thead">
                    <Box component="tr" sx={{ '& th': { textAlign: 'right', py: 0.75, borderBottom: '1px solid', borderColor: 'grey.200', fontWeight: 700, fontSize: 11, color: 'grey.600', textTransform: 'uppercase' } }}>
                      <Box component="th">{L('כיתה', 'Class')}</Box>
                      <Box component="th">{L('שיעורים', 'Lessons')}</Box>
                      <Box component="th">{L('חלונות', 'Windows')}</Box>
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
                          {L('✓ אין חלונות אצל אף כיתה', '✓ No class has any windows')}
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
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
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
        title: L(
          `${overCap.length} מורים מעל המכסה (>100% ניצול)`,
          `${overCap.length} teachers over their cap (>100% utilization)`,
        ),
        detail: overCap.slice(0, 5).map((t) =>
          `${t.name} — ${t.utilization_pct}%`).join(' · ')
          + (overCap.length > 5 ? L(` · +${overCap.length - 5} נוספים`, ` · +${overCap.length - 5} more`) : ''),
      });
    }

    const longGaps = quality.teachers.filter((t) => t.long_windows > 0);
    if (longGaps.length > 0) {
      list.push({
        severity: 'error',
        title: L(
          `${longGaps.length} מורים עם חלון של ${quality.long_window_threshold}+ שעות`,
          `${longGaps.length} teachers with a window of ${quality.long_window_threshold}+ hours`,
        ),
        detail: longGaps.slice(0, 5).map((t) =>
          L(`${t.name} — פער ${t.max_single_gap}`, `${t.name} — gap ${t.max_single_gap}`)).join(' · '),
      });
    }

    const tooFewLessons = quality.classes.filter((c) => c.lessons < 25);
    if (tooFewLessons.length > 0) {
      list.push({
        severity: 'warning',
        title: L(
          `${tooFewLessons.length} כיתות עם פחות מ-25 שיעורים שבועיים`,
          `${tooFewLessons.length} classes with fewer than 25 weekly lessons`,
        ),
        detail: tooFewLessons.slice(0, 8).map((c) =>
          `${c.name} (${c.lessons})`).join(' · '),
      });
    }

    const tooManyLessons = quality.classes.filter((c) => c.lessons > 45);
    if (tooManyLessons.length > 0) {
      list.push({
        severity: 'warning',
        title: L(
          `${tooManyLessons.length} כיתות עם מעל 45 שיעורים שבועיים`,
          `${tooManyLessons.length} classes with more than 45 weekly lessons`,
        ),
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
        title: L(
          `${teacherSingleClass.length} מורים עם 10+ שעות בכיתה אחת בלבד`,
          `${teacherSingleClass.length} teachers with 10+ hours in a single class`,
        ),
        detail: L(
          'יש לבדוק אם הנתון נכון (יתכנו בעיות בייבוא)',
          'Worth checking whether this is correct (possible import issues)',
        ),
      });
    }

    return list;
  }, [quality]);

  if (issues.length === 0) {
    return (
      <Alert severity="success" sx={{ mb: 0 }}>
        {L('✓ לא נמצאו בעיות בנתונים — המערכת נראית מאוזנת', '✓ No data issues found — the schedule looks balanced')}
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1.5 }}>
          {L(`בעיות שזוהו (${issues.length})`, `Issues found (${issues.length})`)}
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
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const dayNames: Record<number, string> = isRtl
    ? { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה' }
    : { 1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu' };
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
