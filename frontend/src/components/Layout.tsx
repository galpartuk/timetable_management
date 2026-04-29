import { type ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, Divider, Button,
} from '@mui/material';
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

const DRAWER_WIDTH = 260;

interface LayoutProps {
  children: ReactNode;
  user: any;
  onLogout: () => void;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const menuItems = [
    { text: t('nav.dashboard'), icon: <DashboardIcon />, path: '/' },
    { text: t('nav.data'), icon: <DataIcon />, path: '/data' },
    { text: t('nav.import'), icon: <UploadIcon />, path: '/import' },
    { text: t('nav.constraints'), icon: <ConstraintIcon />, path: '/constraints' },
    { text: t('nav.timetable'), icon: <TimetableIcon />, path: '/timetable' },
  ];

  const adminItems = [
    { text: t('nav.adminUsers'), icon: <UsersIcon />, path: '/admin/users' },
    { text: t('nav.adminAudit'), icon: <AuditIcon />, path: '/admin/audit' },
  ];

  const handleLogout = async () => {
    await apiLogout();
    onLogout();
  };

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he');
  };

  return (
    <Box>
      <AppBar position="fixed">
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {t('app.title')}
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.full_name || user?.first_name || user?.username}
          </Typography>
          <Button color="inherit" size="small" onClick={toggleLang}>
            {i18n.language === 'he' ? 'EN' : 'HE'}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor={i18n.language === 'he' ? 'right' : 'left'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
            {t('app.title')}
          </Typography>
        </Toolbar>
        <Divider />
        <List>
          {menuItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
        </List>
        {isSuperAdmin && (
          <>
            <Divider />
            <List subheader={<Typography variant="overline" sx={{ pl: 2 }}>{t('nav.adminSection')}</Typography>}>
              {adminItems.map((item) => (
                <ListItemButton
                  key={item.path}
                  selected={location.pathname === item.path}
                  onClick={() => {
                    navigate(item.path);
                    setDrawerOpen(false);
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
        <Divider />
        <List>
          <ListItemButton onClick={toggleLang}>
            <ListItemIcon><LangIcon /></ListItemIcon>
            <ListItemText primary={i18n.language === 'he' ? 'English' : 'עברית'} />
          </ListItemButton>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('nav.logout')} />
          </ListItemButton>
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          p: 3,
          mt: '64px',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
