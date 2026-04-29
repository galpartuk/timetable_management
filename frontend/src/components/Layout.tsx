import { type ReactNode, type ReactElement, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, Button, Avatar, Tooltip,
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
  const isRtl = i18n.language === 'he';
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
    await apiLogout();
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
              fontSize: 16,
              letterSpacing: '-0.02em',
            }}
          >
            מ.ש
          </Box>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {t('app.title')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'grey.500', fontSize: 11 }}>
              {isRtl ? 'ניהול בית ספר' : 'School Manager'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Typography
          variant="overline"
          sx={{ px: 4, color: 'grey.500', fontSize: 10, display: 'block', mb: 0.5 }}
        >
          {isRtl ? 'תפריט' : 'Menu'}
        </Typography>
        <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {menuItems.map(renderNavItem)}
        </List>

        {isSuperAdmin && (
          <>
            <Typography
              variant="overline"
              sx={{ px: 4, color: 'grey.500', fontSize: 10, display: 'block', mt: 2.5, mb: 0.5 }}
            >
              {t('nav.adminSection')}
            </Typography>
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {adminItems.map(renderNavItem)}
            </List>
          </>
        )}
      </Box>

      {/* Footer: user card */}
      <Box sx={{ px: 2, pt: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.25,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            background: 'grey.50',
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
            <Typography variant="caption" sx={{ color: 'grey.500', fontSize: 11 }} noWrap>
              {user?.email || (isRtl ? 'מנהל מערכת' : 'Administrator')}
            </Typography>
          </Box>
          <Tooltip title={t('nav.logout') as string}>
            <IconButton size="small" onClick={handleLogout} sx={{ color: 'grey.500' }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
          <Button
            startIcon={<LangIcon fontSize="small" />}
            onClick={toggleLang}
            size="small"
            sx={{ color: 'grey.600', fontSize: 12 }}
          >
            {i18n.language === 'he' ? 'English' : 'עברית'}
          </Button>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: 'background.default' }}>
      {/* Top bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mr: { md: isRtl ? `${DRAWER_WIDTH}px` : 0 },
          ml: { md: isRtl ? 0 : `${DRAWER_WIDTH}px` },
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
            <Typography variant="overline" sx={{ color: 'grey.500', display: 'block', lineHeight: 1, mb: 0.25 }}>
              {t('app.title')}
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.012em' }} noWrap>
              {currentPage?.text || ''}
            </Typography>
          </Box>

          <Button
            onClick={toggleLang}
            size="small"
            startIcon={<LangIcon fontSize="small" />}
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              color: 'grey.600',
            }}
          >
            {i18n.language === 'he' ? 'EN' : 'HE'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          anchor={isRtl ? 'right' : 'left'}
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
            anchor={isRtl ? 'right' : 'left'}
            open
            sx={{
              display: { xs: 'none', md: 'block' },
              '& .MuiDrawer-paper': {
                width: DRAWER_WIDTH,
                boxSizing: 'border-box',
                borderInlineStart: 'none',
                borderInlineEnd: '1px solid rgba(20, 24, 31, 0.06)',
              },
            }}
          >
            {sidebarContent}
          </Drawer>
        )}
      </Box>

      {/* Main */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
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
