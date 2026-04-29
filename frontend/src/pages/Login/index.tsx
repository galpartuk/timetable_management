import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress,
  Link, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { Translate as LangIcon } from '@mui/icons-material';
import { googleLogin, login, requestOtp, verifyOtp } from '../../api/client';
import { GOOGLE_CLIENT_ID } from '../../utils/constants';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: { theme: string; size: string; width: number; text?: string },
          ) => void;
        };
      };
    };
  }
}

interface LoginPageProps {
  onLogin: (user: any) => void;
}

type TabValue = 'google' | 'phone' | 'password';
type PhoneStep = 'input' | 'otp';

const colStack = { display: 'flex', flexDirection: 'column', gap: 2 } as const;
const rowStack = { display: 'flex', flexDirection: 'row', gap: 1, justifyContent: 'center' } as const;

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabValue>('google');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordTab, setShowPasswordTab] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
  const [otpUserId, setOtpUserId] = useState<number | null>(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (tab !== 'google') return;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (window.google && googleBtnRef.current) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with',
        });
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleGoogleCallback = async (response: { credential: string }) => {
    setError('');
    setLoading(true);
    try {
      const res = await googleLogin(response.credential);
      onLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('login.googleError'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      onLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!phone.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await requestOtp(phone.trim());
      const data = res.data;
      if (data.success) {
        setOtpUserId(data.user_id);
        setPhoneStep('otp');
        setOtpDigits(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
      } else {
        setError(data.message || t('login.callFailed'));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('login.phoneNotFound'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    if (otpUserId === null) return;
    const code = codeOverride ?? otpDigits.join('');
    if (code.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await verifyOtp(otpUserId, code);
      onLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('login.otpError'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (i: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otpDigits];
    next[i] = value;
    setOtpDigits(next);
    if (value && i < 5) otpRefs.current[i + 1]?.focus();
    if (value && next.every((d) => d !== '')) handleVerifyOtp(next.join(''));
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, [i18n.language === 'he' ? 'left' : 'right']: 16 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LangIcon />}
          onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}
        >
          {i18n.language === 'he' ? 'English' : 'עברית'}
        </Button>
      </Box>

      <Card sx={{ width: 460, maxWidth: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 700 }}>
            {t('app.title')}
          </Typography>
          <Typography variant="h6" align="center" gutterBottom color="text.secondary" sx={{ mb: 3 }}>
            {t('login.title')}
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, v) => { setError(''); setTab(v); }}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab value="google" label={t('login.tabGoogle')} />
            <Tab value="phone" label={t('login.tabPhone')} />
            {showPasswordTab && <Tab value="password" label={t('login.tabPassword')} />}
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {tab === 'google' && (
            <Box sx={{ ...colStack, alignItems: 'center', minHeight: 100 }}>
              {loading && <CircularProgress size={24} />}
              <Box ref={googleBtnRef} sx={{ display: 'flex', justifyContent: 'center' }} />
              <Typography variant="caption" color="text.secondary" align="center">
                {t('login.googleHint')}
              </Typography>
            </Box>
          )}

          {tab === 'phone' && phoneStep === 'input' && (
            <Box sx={colStack}>
              <TextField
                fullWidth
                label={t('login.phone')}
                placeholder="050-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                slotProps={{ htmlInput: { inputMode: 'tel', dir: 'ltr' } }}
              />
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || !phone.trim()}
                onClick={handleSendCode}
                startIcon={loading ? <CircularProgress size={18} /> : null}
              >
                {t('login.sendCode')}
              </Button>
            </Box>
          )}

          {tab === 'phone' && phoneStep === 'otp' && (
            <Box sx={{ ...colStack, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary" align="center">
                {t('login.otpInstructions')}
              </Typography>
              <Box sx={rowStack} dir="ltr">
                {otpDigits.map((d, i) => (
                  <TextField
                    key={i}
                    value={d}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    slotProps={{
                      htmlInput: {
                        ref: (el: HTMLInputElement | null) => { otpRefs.current[i] = el; },
                        maxLength: 1,
                        inputMode: 'numeric',
                        style: { textAlign: 'center', fontSize: 24, width: 36 },
                      },
                    }}
                  />
                ))}
              </Box>
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || otpDigits.some((d) => !d)}
                onClick={() => handleVerifyOtp()}
              >
                {t('login.verify')}
              </Button>
              <Link
                component="button"
                variant="caption"
                onClick={() => { setPhoneStep('input'); setError(''); }}
                disabled={loading}
              >
                {t('login.changePhone')}
              </Link>
            </Box>
          )}

          {tab === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <TextField
                fullWidth
                label={t('login.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                margin="normal"
                autoFocus
              />
              <TextField
                fullWidth
                type="password"
                label={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {t('login.submit')}
              </Button>
            </form>
          )}

          {!showPasswordTab && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Link
                component="button"
                variant="caption"
                onClick={() => { setShowPasswordTab(true); setTab('password'); }}
              >
                {t('login.usePassword')}
              </Link>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
