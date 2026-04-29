import { type ReactNode, type ReactElement, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, Button, Avatar,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Storage as DataIcon,
  Upload as UploadIcon,
  Rule as ConstraintIcon,
  CalendarMonth as TimetableIcon,
  Translate as LangIcon,
  Logout as LogoutIcon,
  ManageAccounts as UsersIcon,
  History as AuditIcon,
} from '@mui/icons-material';
import { logout as apiLogout } from '../api/client';

const DRAWER_WIDTH = 280;

interface LayoutProps {
  children: ReactNode;
  user: any;
  onLogout: () => void;
}

interface NavItem {
  text: string;
  icon: ReactElement;
  path: string;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';

  const menuItems: NavItem[] = [
    { text: t('nav.dashboard'), icon: <DashboardIcon fontSize="small" />, path: '/' },
    { text: t('nav.timetable'), icon: <TimetableIcon fontSize="small" />, path: '/timetable' },
    { text: t('nav.data'), icon: <DataIcon fontSize="small" />, path: '/data' },
    { text: t('nav.constraints'), icon: <ConstraintIcon fontSize="small" />, path: '/constraints' },
    { text: t('nav.import'), icon: <UploadIcon fontSize="small" />, path: '/import' },
  ];

  const adminItems: NavItem[] = [
    { text: t('nav.adminUsers'), icon: <UsersIcon fontSize="small" />, path: '/admin/users' },
    { text: t('nav.adminAudit'), icon: <AuditIcon fontSize="small" />, path: '/admin/audit' },
  ];

  const allItems = [...menuItems, ...(isSuperAdmin ? adminItems : [])];
  const currentPage = allItems.find((m) => m.path === location.pathname);

  const handleLogout = async () => {
    // Always clear local state, even if the server-side logout fails
    // (expired session, network blip, etc.) — otherwise the user is stuck.
    try {
      await apiLogout();
    } catch {
      // ignore; local state still cleared below
    }
    onLogout();
  };

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he');
  };

  const userInitials = (user?.full_name?.[0] || user?.first_name?.[0] || user?.email?.[0] || user?.username?.[0] || '?').toUpperCase();
  const userName = user?.full_name
    || (user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : user?.username || '');

  const renderNavItem = (item: NavItem) => (
    <ListItemButton
      key={item.path}
      selected={location.pathname === item.path}
      onClick={() => {
        navigate(item.path);
        setMobileOpen(false);
      }}
    >
      <ListItemIcon>{item.icon}</ListItemIcon>
      <ListItemText primary={item.text} />
    </ListItemButton>
  );

  const sidebarContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2 }}>
      {/* Brand */}
      <Box sx={{ px: 3, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px -6px rgba(79, 70, 229, 0.6)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: 0,
              lineHeight: 1,
            }}
          >
            מ.ש
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }} noWrap>
              {t('app.title')}
            </Typography>
            <Typography sx={{ color: 'grey.500', fontSize: 11, letterSpacing: 0 }} noWrap>
              {i18n.language === 'he' ? 'ניהול בית ספר' : 'School Manager'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Typography
          sx={{
            px: 4, mb: 0.5,
            color: 'grey.500',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: i18n.language === 'he' ? 0 : '0.08em',
            textTransform: i18n.language === 'he' ? 'none' : 'uppercase',
            display: 'block',
          }}
        >
          {i18n.language === 'he' ? 'תפריט' : 'Menu'}
        </Typography>
        <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {menuItems.map(renderNavItem)}
        </List>

        {isSuperAdmin && (
          <>
            <Typography
              sx={{
                px: 4, mt: 2.5, mb: 0.5,
                color: 'grey.500',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: i18n.language === 'he' ? 0 : '0.08em',
                textTransform: i18n.language === 'he' ? 'none' : 'uppercase',
                display: 'block',
              }}
            >
              {t('nav.adminSection')}
            </Typography>
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {adminItems.map(renderNavItem)}
            </List>
          </>
        )}
      </Box>

      {/* Footer: user card + logout */}
      <Box sx={{ px: 2, pt: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.25,
            mb: 1,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            background: '#fff',
          }}
        >
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: 'primary.main',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {userInitials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }} noWrap>
              {userName}
            </Typography>
            <Typography sx={{ color: 'grey.500', fontSize: 11, letterSpacing: 0 }} noWrap>
              {user?.email || (i18n.language === 'he' ? 'מנהל מערכת' : 'Administrator')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Button
            fullWidth
            size="small"
            variant="outlined"
            startIcon={<LogoutIcon fontSize="small" />}
            onClick={handleLogout}
            sx={{ color: 'grey.700', fontSize: 13 }}
          >
            {t('nav.logout')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={toggleLang}
            sx={{ color: 'grey.700', fontSize: 13, minWidth: 'auto', px: 1.25 }}
            aria-label="toggle language"
          >
            <LangIcon fontSize="small" />
          </Button>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: 'background.default' }}>
      {/* Top bar — uses logical `ml`; emotion's RTL plugin flips for Hebrew automatically.
          Do NOT branch on isRtl here, that double-flips. */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' }, mr: 1 }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ color: 'grey.500', fontSize: 11, fontWeight: 600, letterSpacing: 0, lineHeight: 1, mb: 0.25 }}>
              {t('app.title')}
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.012em' }} noWrap>
              {currentPage?.text || ''}
            </Typography>
          </Box>

          {/* Small-screen quick logout — sidebar isn't visible on mobile */}
          <IconButton
            onClick={handleLogout}
            size="small"
            aria-label={t('nav.logout') as string}
            sx={{ display: { xs: 'inline-flex', md: 'none' }, color: 'grey.600' }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Sidebar — anchor="left" is auto-flipped to "right" in RTL by MUI Drawer
          when theme.direction === 'rtl'. Don't conditional-flip here. */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          anchor="left"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {sidebarContent}
        </Drawer>

        {isDesktop && (
          <Drawer
            variant="permanent"
            anchor="left"
            open
            sx={{
              display: { xs: 'none', md: 'block' },
              '& .MuiDrawer-paper': {
                width: DRAWER_WIDTH,
                boxSizing: 'border-box',
                background: 'background.default',
                borderColor: 'divider',
              },
            }}
          >
            {sidebarContent}
          </Drawer>
        )}
      </Box>

      {/* Main content — flex:1 fills remaining space; no explicit width so RTL flows naturally */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          mt: '68px',
          px: { xs: 2, sm: 3, md: 5 },
          py: { xs: 3, md: 4 },
        }}
      >
        <Box className="app-fade-in" sx={{ maxWidth: 'var(--content-max-width)', mx: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
