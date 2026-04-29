import { useMemo, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DataEntry from './pages/DataEntry';
import ImportPage from './pages/Import';
import ConstraintsPage from './pages/Constraints';
import TimetablePage from './pages/Timetable';
import LoginPage from './pages/Login';
import AdminUsersPage from './pages/Admin/Users';
import AdminAuditPage from './pages/Admin/Audit';
import AiAssistant, { AiAssistantProvider } from './components/AiAssistant';
import { getMe } from './api/client';

const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
  key: 'muiltr',
  stylisPlugins: [prefixer],
});

const FONT_STACK = `'Heebo', 'Assistant', 'IBM Plex Sans Hebrew', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

function App() {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const theme = useMemo(
    () =>
      createTheme({
        direction: isRtl ? 'rtl' : 'ltr',
        shape: { borderRadius: 14 },
        palette: {
          mode: 'light',
          primary: {
            main: '#4f46e5',
            light: '#818cf8',
            dark: '#4338ca',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#0ea5e9',
            contrastText: '#ffffff',
          },
          success: { main: '#059669', light: '#10b981', dark: '#047857' },
          warning: { main: '#d97706', light: '#f59e0b', dark: '#b45309' },
          error: { main: '#e11d48', light: '#f43f5e', dark: '#be123c' },
          info: { main: '#0ea5e9', light: '#38bdf8', dark: '#0284c7' },
          grey: {
            50: '#f8f9fb',
            100: '#f1f3f7',
            200: '#e4e7ee',
            300: '#d2d6df',
            400: '#a4abb8',
            500: '#717987',
            600: '#525a68',
            700: '#3a4150',
            800: '#232936',
            900: '#14181f',
          },
          background: {
            default: '#f8f9fb',
            paper: '#ffffff',
          },
          text: {
            primary: '#14181f',
            secondary: '#525a68',
            disabled: '#a4abb8',
          },
          divider: 'rgba(20, 24, 31, 0.08)',
        },
        typography: {
          fontFamily: FONT_STACK,
          fontSize: 15,
          htmlFontSize: 16,
          h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
          h2: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.018em' },
          h3: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.015em' },
          h4: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.012em' },
          h5: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.4 },
          h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },
          subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
          subtitle2: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.5, color: '#525a68' },
          body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
          body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
          button: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
          caption: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: 0.1, color: '#525a68' },
          overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: { backgroundColor: '#f8f9fb' },
            },
          },
          MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                borderRadius: 16,
              },
            },
          },
          MuiCard: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
              root: {
                borderRadius: 18,
                border: '1px solid rgba(20, 24, 31, 0.06)',
                background: '#ffffff',
                boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
                transition: 'box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              },
            },
          },
          MuiCardContent: {
            styleOverrides: {
              root: {
                padding: 24,
                '&:last-child': { paddingBottom: 24 },
              },
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true, disableRipple: false },
            styleOverrides: {
              root: {
                borderRadius: 12,
                paddingInline: 16,
                paddingBlock: 9,
                fontWeight: 600,
                transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:focus-visible': {
                  boxShadow: '0 0 0 4px rgba(79, 70, 229, 0.20)',
                },
              },
              sizeSmall: { paddingInline: 12, paddingBlock: 6, fontSize: '0.8125rem' },
              sizeLarge: { paddingInline: 20, paddingBlock: 12, fontSize: '0.9375rem' },
              contained: ({ theme }) => ({
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: '0 6px 16px -6px rgba(79, 70, 229, 0.45)',
                  transform: 'translateY(-1px)',
                },
                '&:active': { transform: 'translateY(0)' },
                '&.Mui-disabled': {
                  background: theme.palette.grey[200],
                  color: theme.palette.grey[400],
                },
              }),
              outlined: {
                borderColor: 'rgba(20, 24, 31, 0.12)',
                background: '#ffffff',
                color: '#232936',
                '&:hover': {
                  background: '#f8f9fb',
                  borderColor: 'rgba(20, 24, 31, 0.20)',
                },
              },
              text: {
                '&:hover': { background: 'rgba(20, 24, 31, 0.04)' },
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                transition: 'background 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:hover': { background: 'rgba(20, 24, 31, 0.06)' },
                '&:focus-visible': { boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.20)' },
              },
            },
          },
          MuiTextField: {
            defaultProps: { variant: 'outlined', size: 'medium' },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: ({ theme }) => ({
                borderRadius: 12,
                background: '#ffffff',
                transition: 'box-shadow 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '& fieldset': {
                  borderColor: 'rgba(20, 24, 31, 0.12)',
                  transition: 'border-color 160ms',
                },
                '&:hover fieldset': { borderColor: 'rgba(20, 24, 31, 0.22) !important' },
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main + ' !important',
                  borderWidth: '1px !important',
                },
                '&.Mui-focused': {
                  boxShadow: '0 0 0 4px rgba(79, 70, 229, 0.14)',
                },
                '& .MuiOutlinedInput-input': { padding: '12px 14px' },
                '& .MuiOutlinedInput-inputSizeSmall': { padding: '8px 12px' },
              }),
            },
          },
          MuiInputLabel: {
            styleOverrides: {
              root: { fontWeight: 500, color: '#525a68' },
            },
          },
          MuiAppBar: {
            defaultProps: { elevation: 0, color: 'inherit' },
            styleOverrides: {
              root: {
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'saturate(180%) blur(14px)',
                WebkitBackdropFilter: 'saturate(180%) blur(14px)',
                color: '#14181f',
                borderBottom: '1px solid rgba(20, 24, 31, 0.06)',
                boxShadow: 'none',
              },
            },
          },
          MuiToolbar: {
            styleOverrides: {
              root: { minHeight: 68, '@media (min-width: 600px)': { minHeight: 68 } },
            },
          },
          MuiDrawer: {
            styleOverrides: {
              paper: {
                borderRight: '1px solid rgba(20, 24, 31, 0.06)',
                borderLeft: '1px solid rgba(20, 24, 31, 0.06)',
                background: '#ffffff',
                boxShadow: 'none',
              },
            },
          },
          MuiListItemButton: {
            styleOverrides: {
              root: ({ theme }) => ({
                borderRadius: 12,
                marginInline: 12,
                paddingBlock: 9,
                paddingInline: 12,
                color: theme.palette.grey[700],
                fontWeight: 500,
                transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '& .MuiListItemIcon-root': {
                  color: theme.palette.grey[500],
                  minWidth: 36,
                  transition: 'color 160ms',
                },
                '&:hover': {
                  background: theme.palette.grey[100],
                  color: theme.palette.grey[900],
                  '& .MuiListItemIcon-root': { color: theme.palette.grey[700] },
                },
                '&.Mui-selected': {
                  background: alpha(theme.palette.primary.main, 0.08),
                  color: theme.palette.primary.dark,
                  fontWeight: 600,
                  '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
                  '&:hover': { background: alpha(theme.palette.primary.main, 0.12) },
                },
              }),
            },
          },
          MuiListItemText: {
            styleOverrides: {
              primary: { fontSize: '0.9375rem', fontWeight: 'inherit' },
            },
          },
          MuiTabs: {
            styleOverrides: {
              root: { minHeight: 44 },
              indicator: { height: 3, borderRadius: 3 },
            },
          },
          MuiTab: {
            styleOverrides: {
              root: ({ theme }) => ({
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9375rem',
                minHeight: 44,
                paddingInline: 16,
                color: theme.palette.grey[500],
                '&.Mui-selected': { color: theme.palette.primary.dark },
              }),
            },
          },
          MuiToggleButtonGroup: {
            styleOverrides: {
              root: ({ theme }) => ({
                background: theme.palette.grey[100],
                padding: 4,
                borderRadius: 12,
                gap: 2,
              }),
              grouped: {
                border: 'none !important',
                borderRadius: '8px !important',
                margin: 0,
              },
            },
          },
          MuiToggleButton: {
            styleOverrides: {
              root: ({ theme }) => ({
                border: 'none',
                borderRadius: 8,
                paddingInline: 14,
                paddingBlock: 6,
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: theme.palette.grey[600],
                textTransform: 'none',
                transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                '&:hover': { background: 'rgba(255,255,255,0.6)' },
                '&.Mui-selected': {
                  background: '#ffffff',
                  color: theme.palette.grey[900],
                  boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.06)',
                  '&:hover': { background: '#ffffff' },
                },
              }),
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.75rem',
                height: 24,
              },
              filled: ({ theme }) => ({
                background: theme.palette.grey[100],
                color: theme.palette.grey[700],
              }),
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                borderRadius: 20,
                boxShadow: '0 32px 64px -20px rgba(15, 23, 42, 0.25), 0 12px 24px -8px rgba(15, 23, 42, 0.1)',
              },
            },
          },
          MuiDialogTitle: {
            styleOverrides: {
              root: { fontSize: '1.25rem', fontWeight: 700, paddingBlock: 20, paddingInline: 24 },
            },
          },
          MuiDialogContent: {
            styleOverrides: {
              root: { paddingInline: 24 },
            },
          },
          MuiDialogActions: {
            styleOverrides: {
              root: { padding: 20, gap: 8 },
            },
          },
          MuiAlert: {
            styleOverrides: {
              root: {
                borderRadius: 12,
                fontSize: '0.875rem',
                padding: '10px 14px',
                '&.MuiAlert-standardError': { background: 'rgba(244, 63, 94, 0.08)', color: '#9f1239' },
                '&.MuiAlert-standardSuccess': { background: 'rgba(16, 185, 129, 0.10)', color: '#065f46' },
                '&.MuiAlert-standardWarning': { background: 'rgba(245, 158, 11, 0.12)', color: '#92400e' },
                '&.MuiAlert-standardInfo': { background: 'rgba(14, 165, 233, 0.10)', color: '#075985' },
              },
            },
          },
          MuiTable: {
            styleOverrides: {
              root: { borderCollapse: 'separate', borderSpacing: 0 },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                borderBottom: '1px solid rgba(20, 24, 31, 0.06)',
                padding: '14px 16px',
                fontSize: '0.875rem',
              },
              head: ({ theme }) => ({
                background: theme.palette.grey[50],
                color: theme.palette.grey[600],
                fontWeight: 600,
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                paddingBlock: 12,
              }),
            },
          },
          MuiTableRow: {
            styleOverrides: {
              root: ({ theme }) => ({
                transition: 'background 120ms',
                '&:last-child td': { borderBottom: 0 },
                '&:hover td': { background: alpha(theme.palette.grey[100], 0.6) },
              }),
            },
          },
          MuiSwitch: {
            styleOverrides: {
              root: {
                width: 40,
                height: 24,
                padding: 0,
                '& .MuiSwitch-switchBase': {
                  padding: 3,
                  '&.Mui-checked': {
                    transform: 'translateX(16px)',
                    color: '#fff',
                    '& + .MuiSwitch-track': {
                      backgroundColor: '#4f46e5',
                      opacity: 1,
                    },
                  },
                },
                '& .MuiSwitch-thumb': {
                  width: 18,
                  height: 18,
                  boxShadow: '0 1px 3px 0 rgba(15,23,42,0.2)',
                },
                '& .MuiSwitch-track': {
                  borderRadius: 12,
                  backgroundColor: '#d2d6df',
                  opacity: 1,
                },
              },
            },
          },
          MuiLinearProgress: {
            styleOverrides: {
              root: {
                height: 6,
                borderRadius: 999,
                background: 'rgba(20, 24, 31, 0.06)',
              },
              bar: { borderRadius: 999 },
            },
          },
          MuiTooltip: {
            styleOverrides: {
              tooltip: {
                background: '#14181f',
                fontSize: '0.75rem',
                fontWeight: 500,
                borderRadius: 8,
                padding: '6px 10px',
              },
              arrow: { color: '#14181f' },
            },
          },
        },
      }),
    [isRtl],
  );

  useEffect(() => {
    document.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [isRtl, i18n.language]);

  if (loading) return null;

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <CacheProvider value={isRtl ? cacheRtl : cacheLtr}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          {user ? (
            <AiAssistantProvider>
              <Layout user={user} onLogout={() => setUser(null)}>
                <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/data" element={<DataEntry />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/constraints" element={<ConstraintsPage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route
                  path="/admin/users"
                  element={isSuperAdmin ? <AdminUsersPage /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/admin/audit"
                  element={isSuperAdmin ? <AdminAuditPage /> : <Navigate to="/" replace />}
                />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <AiAssistant />
            </Layout>
            </AiAssistantProvider>
          ) : (
            <Routes>
              <Route path="*" element={<LoginPage onLogin={setUser} />} />
            </Routes>
          )}
        </BrowserRouter>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default App;
