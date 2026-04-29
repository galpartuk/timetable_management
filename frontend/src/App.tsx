import { useMemo, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
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
import { getMe } from './api/client';

// RTL cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
  key: 'muiltr',
  stylisPlugins: [prefixer],
});

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
        typography: {
          fontFamily: "'Rubik', sans-serif",
        },
        palette: {
          primary: { main: '#1976d2' },
          secondary: { main: '#f50057' },
          background: { default: '#f5f5f5' },
        },
      }),
    [isRtl],
  );

  useEffect(() => {
    document.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [isRtl, i18n.language]);

  if (loading) return null;

  return (
    <CacheProvider value={isRtl ? cacheRtl : cacheLtr}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          {user ? (
            <Layout user={user} onLogout={() => setUser(null)}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/data" element={<DataEntry />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/constraints" element={<ConstraintsPage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Layout>
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
