import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Card, Chip, CircularProgress, FormControl, InputLabel,
  MenuItem, Select, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, Typography,
} from '@mui/material';
import { CheckCircle, Cancel, Phone, Lock, Google, History as HistoryIcon } from '@mui/icons-material';
import { getAuditActivities, getAuditLogins } from '../../../api/client';

function parseBrowser(ua: string): string {
  if (!ua) return '—';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  return 'Other';
}

function parseOS(ua: string): string {
  if (!ua) return '';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return '';
}

function methodIcon(method: string) {
  if (method === 'google') return <Google fontSize="small" />;
  if (method === 'phone') return <Phone fontSize="small" />;
  return <Lock fontSize="small" />;
}

export default function AdminAuditPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'logins' | 'activities'>('logins');
  const [logins, setLogins] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterSuccess, setFilterSuccess] = useState<string>('');
  const isRtl = i18n.language === 'he';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'logins') {
        const res = await getAuditLogins({
          method: filterMethod || undefined,
          success: (filterSuccess as 'true' | 'false') || undefined,
        });
        setLogins(res.data);
      } else {
        const res = await getAuditActivities();
        setActivities(res.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, filterMethod, filterSuccess]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          {t('admin.auditTitle')}
        </Typography>
        <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
          {isRtl
            ? 'התחברויות ופעולות במערכת לפי משתמש, שיטה וסטטוס.'
            : 'Logins and system actions by user, method, and status.'}
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab value="logins" label={t('admin.auditTabLogins')} />
        <Tab value="activities" label={t('admin.auditTabActivities')} />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {tab === 'logins' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('admin.filterMethod')}</InputLabel>
            <Select value={filterMethod} label={t('admin.filterMethod')}
                    onChange={(e) => setFilterMethod(e.target.value)}>
              <MenuItem value="">{t('admin.all')}</MenuItem>
              <MenuItem value="google">Google</MenuItem>
              <MenuItem value="phone">Phone</MenuItem>
              <MenuItem value="password">Password</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('admin.filterStatus')}</InputLabel>
            <Select value={filterSuccess} label={t('admin.filterStatus')}
                    onChange={(e) => setFilterSuccess(e.target.value)}>
              <MenuItem value="">{t('admin.all')}</MenuItem>
              <MenuItem value="true">{t('admin.success')}</MenuItem>
              <MenuItem value="false">{t('admin.failure')}</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      )}

      <Card>
        <TableContainer>
          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : tab === 'logins' ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.when')}</TableCell>
                  <TableCell>{t('admin.user')}</TableCell>
                  <TableCell>{t('admin.method')}</TableCell>
                  <TableCell>{t('admin.status')}</TableCell>
                  <TableCell>{t('admin.ip')}</TableCell>
                  <TableCell>{t('admin.browser')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logins.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.700', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(l.created_at).toLocaleString('he-IL')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                        {l.user_email || l.user_label || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={methodIcon(l.method)} label={l.method} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {l.success
                        ? <Chip size="small" icon={<CheckCircle />} label={t('admin.success')} color="success" />
                        : <Chip size="small" icon={<Cancel />} label={t('admin.failure')} color="error" />}
                    </TableCell>
                    <TableCell dir="ltr">
                      <Typography sx={{ fontSize: 13, fontFamily: 'monospace', color: 'grey.600' }}>
                        {l.ip_address || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.600' }}>
                        {[parseBrowser(l.user_agent), parseOS(l.user_agent)].filter(Boolean).join(' / ')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {logins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ borderBottom: 0 }}>
                      <EmptyAuditState />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.when')}</TableCell>
                  <TableCell>{t('admin.user')}</TableCell>
                  <TableCell>{t('admin.action')}</TableCell>
                  <TableCell>{t('admin.details')}</TableCell>
                  <TableCell>{t('admin.ip')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activities.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.700', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(a.created_at).toLocaleString('he-IL')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                        {a.user_email || a.user_label || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={a.action} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Box
                        component="code"
                        sx={{
                          fontSize: 12,
                          color: 'grey.700',
                          background: 'grey.50',
                          px: 1, py: 0.5,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'inline-block',
                          maxWidth: 360,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {JSON.stringify(a.details)}
                      </Box>
                    </TableCell>
                    <TableCell dir="ltr">
                      <Typography sx={{ fontSize: 13, fontFamily: 'monospace', color: 'grey.600' }}>
                        {a.ip_address || '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {activities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                      <EmptyAuditState />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>
    </Box>
  );
}

function EmptyAuditState() {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 6 }}>
      <Box
        sx={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'grey.50',
          color: 'grey.400',
          border: '1px dashed',
          borderColor: 'grey.200',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mb: 1.5,
        }}
      >
        <HistoryIcon fontSize="small" />
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'grey.700' }}>
        {t('admin.noLogs')}
      </Typography>
    </Box>
  );
}
