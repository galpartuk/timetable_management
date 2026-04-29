import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Block as BlockIcon,
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

const colStack = { display: 'flex', flexDirection: 'column', gap: 2 } as const;
const rowBetween = { display: 'flex', alignItems: 'center', gap: 2, mb: 3 } as const;

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AdminUserPayload>({
    full_name: '', email: '', phone: '', role: 'editor', password: '',
  });

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
      <Box sx={rowBetween}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>{t('admin.usersTitle')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          {t('admin.addUser')}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper}>
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
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell dir="ltr">{u.phone || '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={roleLabel(u.role)} color={u.role === 'super_admin' ? 'primary' : 'default'} />
                  </TableCell>
                  <TableCell>
                    {u.is_active
                      ? <Chip size="small" label={t('admin.active')} color="success" />
                      : <Chip size="small" label={t('admin.inactive')} />}
                  </TableCell>
                  <TableCell>{u.last_login ? new Date(u.last_login).toLocaleString('he-IL') : '—'}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleEdit(u)} title={t('admin.edit')}>
                      <EditIcon />
                    </IconButton>
                    {u.is_active && (
                      <IconButton onClick={() => handleDeactivate(u)} title={t('admin.deactivate')}>
                        <BlockIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center">{t('admin.noUsers')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={open} onClose={reset} fullWidth maxWidth="sm">
        <DialogTitle>{editId !== null ? t('admin.editUser') : t('admin.addUser')}</DialogTitle>
        <DialogContent>
          <Box sx={{ ...colStack, mt: 1 }}>
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={reset} disabled={submitting}>{t('admin.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !form.full_name || !form.email}
          >
            {submitting ? <CircularProgress size={20} /> : t('admin.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
