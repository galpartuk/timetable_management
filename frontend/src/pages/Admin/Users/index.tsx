import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Block as BlockIcon,
  ManageAccounts as UsersIcon,
} from '@mui/icons-material';
import {
  AdminUserPayload, createAdminUser, deactivateAdminUser,
  getAdminUsers, updateAdminUser,
} from '../../../api/client';

const ROLES: { value: string; label: string }[] = [
  { value: 'super_admin', label: 'מנהל ראשי' },
  { value: 'admin', label: 'מנהל' },
  { value: 'editor', label: 'עורך' },
  { value: 'viewer', label: 'צופה' },
];

const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

const roleColor = (r: string): 'primary' | 'success' | 'warning' | 'default' => {
  if (r === 'super_admin') return 'primary';
  if (r === 'admin') return 'warning';
  if (r === 'editor') return 'success';
  return 'default';
};

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AdminUserPayload>({
    full_name: '', email: '', phone: '', role: 'editor', password: '',
  });
  const isRtl = i18n.language === 'he';

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdminUsers();
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin.loadError'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({ full_name: '', email: '', phone: '', role: 'editor', password: '' });
    setEditId(null);
    setOpen(false);
  };

  const handleEdit = (u: any) => {
    setEditId(u.id);
    setForm({
      full_name: u.full_name || '', email: u.email || '',
      phone: u.phone || '', role: u.role || 'editor', password: '',
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload: Partial<AdminUserPayload> = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      if (editId !== null) await updateAdminUser(editId, payload);
      else await createAdminUser(payload as AdminUserPayload);
      reset();
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (u: any) => {
    if (!confirm(t('admin.confirmDeactivate'))) return;
    try {
      await deactivateAdminUser(u.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin.saveError'));
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            {t('admin.usersTitle')}
          </Typography>
          <Typography sx={{ color: 'grey.600', fontSize: 14 }}>
            {isRtl
              ? 'הוספה, עריכה והשבתה של משתמשים, וניהול הרשאות.'
              : 'Add, edit, and deactivate users, and manage their roles.'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          {t('admin.addUser')}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.fullName')}</TableCell>
                <TableCell>{t('admin.email')}</TableCell>
                <TableCell>{t('admin.phone')}</TableCell>
                <TableCell>{t('admin.role')}</TableCell>
                <TableCell>{t('admin.status')}</TableCell>
                <TableCell>{t('admin.lastLogin')}</TableCell>
                <TableCell align="right">{t('admin.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ borderBottom: 0, py: 6, textAlign: 'center' }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ borderBottom: 0 }}>
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
                        <UsersIcon fontSize="small" />
                      </Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'grey.700' }}>
                        {t('admin.noUsers')}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : users.map((u) => {
                const name = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim();
                const initial = (name || u.email || '?').charAt(0).toUpperCase();
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                          {initial}
                        </Avatar>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.600' }}>{u.email}</Typography>
                    </TableCell>
                    <TableCell dir="ltr">
                      <Typography sx={{ fontSize: 13, color: 'grey.600', fontVariantNumeric: 'tabular-nums' }}>
                        {u.phone || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={roleLabel(u.role)}
                        color={roleColor(u.role)}
                        variant={u.role === 'super_admin' ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      {u.is_active
                        ? <Chip size="small" label={t('admin.active')} color="success" variant="outlined" />
                        : <Chip size="small" label={t('admin.inactive')} variant="outlined" />}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: 'grey.600' }}>
                        {u.last_login ? new Date(u.last_login).toLocaleString('he-IL') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <IconButton size="small" onClick={() => handleEdit(u)} title={t('admin.edit')}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        {u.is_active && (
                          <IconButton
                            size="small"
                            onClick={() => handleDeactivate(u)}
                            title={t('admin.deactivate')}
                            sx={{ color: 'grey.500', '&:hover': { color: 'error.main' } }}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={reset} fullWidth maxWidth="sm">
        <DialogTitle>{editId !== null ? t('admin.editUser') : t('admin.addUser')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('admin.fullName')}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              fullWidth required
            />
            <TextField
              label={t('admin.email')}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth required
            />
            <TextField
              label={t('admin.phone')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              fullWidth
              slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'tel' } }}
            />
            <TextField
              label={t('admin.role')}
              select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              fullWidth
            >
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={editId !== null ? t('admin.passwordOptionalEdit') : t('admin.passwordOptional')}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              fullWidth
              helperText={t('admin.passwordHelp')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={reset} variant="text" disabled={submitting}>{t('admin.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !form.full_name || !form.email}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t('admin.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
