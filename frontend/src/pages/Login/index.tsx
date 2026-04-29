import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, CircularProgress, IconButton, InputAdornment,
  Link, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import {
  Translate as LangIcon,
  Visibility, VisibilityOff,
  Bolt as BoltIcon, CheckCircle as CheckIcon, AutoAwesome as SparkleIcon,
  Phone as PhoneIcon, Google as GoogleIcon, Lock as LockIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
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

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabValue>('google');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordTab, setShowPasswordTab] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
  const [otpUserId, setOtpUserId] = useState<number | null>(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isRtl = i18n.language === 'he';

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

  const features = [
    {
      icon: <BoltIcon fontSize="small" />,
      text: isRtl ? 'יצירה אוטומטית של מערכת שעות' : 'Automatic timetable generation',
    },
    {
      icon: <CheckIcon fontSize="small" />,
      text: isRtl ? 'ייבוא מאקסל בלחיצה אחת' : 'One-click Excel import',
    },
    {
      icon: <SparkleIcon fontSize="small" />,
      text: isRtl ? 'אילוצים מותאמים אישית' : 'Custom constraints',
    },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '1.05fr 1fr' },
        background: 'background.default',
      }}
    >
      {/* Brand panel */}
      <Box
        sx={{
          position: 'relative',
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 6,
          color: '#fff',
          background:
            'radial-gradient(circle at 80% 20%, #818cf8 0%, transparent 50%), radial-gradient(circle at 20% 80%, #4f46e5 0%, transparent 55%), linear-gradient(135deg, #4338ca 0%, #4f46e5 60%, #6366f1 100%)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute', inset: 0,
            opacity: 0.4,
            background: `
              radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10) 0%, transparent 30%),
              radial-gradient(circle at 70% 70%, rgba(255,255,255,0.06) 0%, transparent 35%)
            `,
            pointerEvents: 'none',
          }}
        />

        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: 3,
              background: 'rgba(255,255,255,0.16)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 18,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            מ.ש
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>
            {t('app.title')}
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 480 }}>
          <Typography
            sx={{
              fontSize: { lg: 36, xl: 44 },
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              mb: 2,
            }}
          >
            {isRtl
              ? 'מערכת שעות, פשוט ומהר.'
              : 'Schedules, simply and fast.'}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, mb: 4, maxWidth: 420 }}>
            {isRtl
              ? 'כלי ניהול חכם לבית הספר — ייבוא נתונים, אילוצים מותאמים, ויצירה אוטומטית של מערכת שעות מלאה.'
              : 'A smart school management tool — import data, set custom constraints, and auto-generate a full timetable.'}
          </Typography>

          <Stack spacing={1.5}>
            {features.map((f, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 28, height: 28, borderRadius: 2,
                    background: 'rgba(255,255,255,0.16)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  {f.icon}
                </Box>
                <Typography sx={{ fontSize: 14, color: 'rgba(255,255,255,0.92)' }}>
                  {f.text}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.6)' }}>
          © {new Date().getFullYear()} {t('app.title')}
        </Typography>
      </Box>

      {/* Form panel */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { xs: 3, sm: 5 },
        }}
      >
        <Button
          onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}
          startIcon={<LangIcon fontSize="small" />}
          size="small"
          sx={{
            position: 'absolute',
            top: 24,
            insetInlineEnd: 24,
            color: 'grey.600',
          }}
        >
          {i18n.language === 'he' ? 'English' : 'עברית'}
        </Button>

        <Box sx={{ width: '100%', maxWidth: 420 }}>
          {/* Brand mark on mobile only */}
          <Box sx={{ display: { xs: 'flex', lg: 'none' }, alignItems: 'center', gap: 1.5, mb: 4 }}>
            <Box
              sx={{
                width: 40, height: 40, borderRadius: 2.5,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 14,
                boxShadow: '0 8px 16px -6px rgba(79, 70, 229, 0.5)',
              }}
            >
              מ.ש
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
              {t('app.title')}
            </Typography>
          </Box>

          <Typography variant="h2" sx={{ mb: 1, fontSize: 28 }}>
            {isRtl ? 'ברוכים הבאים' : 'Welcome back'}
          </Typography>
          <Typography sx={{ color: 'grey.600', mb: 3, fontSize: 14 }}>
            {t('login.title')}
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, v) => { setError(''); setTab(v); }}
            variant="fullWidth"
            sx={{
              mb: 3,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiTab-root': { minHeight: 44, fontSize: 13, gap: 0.75, flexDirection: 'row' },
            }}
          >
            <Tab value="google" icon={<GoogleIcon fontSize="small" />} iconPosition="start" label={t('login.tabGoogle')} />
            <Tab value="phone" icon={<PhoneIcon fontSize="small" />} iconPosition="start" label={t('login.tabPhone')} />
            {showPasswordTab && (
              <Tab value="password" icon={<LockIcon fontSize="small" />} iconPosition="start" label={t('login.tabPassword')} />
            )}
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Google */}
          {tab === 'google' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 140 }}>
              {loading && <CircularProgress size={24} />}
              <Box ref={googleBtnRef} sx={{ display: 'flex', justifyContent: 'center' }} />
              <Typography variant="caption" sx={{ color: 'grey.500', textAlign: 'center', maxWidth: 320 }}>
                {t('login.googleHint')}
              </Typography>
            </Box>
          )}

          {/* Phone — input step */}
          {tab === 'phone' && phoneStep === 'input' && (
            <Stack spacing={2}>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 0.75 }}>
                  {t('login.phone')}
                </Typography>
                <TextField
                  fullWidth
                  placeholder="050-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  slotProps={{ htmlInput: { inputMode: 'tel', dir: 'ltr' } }}
                />
              </Box>
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || !phone.trim()}
                onClick={handleSendCode}
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PhoneIcon />}
                sx={{ py: 1.4, fontSize: 15 }}
              >
                {t('login.sendCode')}
              </Button>
            </Stack>
          )}

          {/* Phone — OTP step */}
          {tab === 'phone' && phoneStep === 'otp' && (
            <Stack spacing={2.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 56, height: 56, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(79,70,229,0.10), rgba(99,102,241,0.04))',
                  border: '1px solid', borderColor: 'primary.light',
                  color: 'primary.main',
                }}
              >
                <PhoneIcon />
              </Box>
              <Typography sx={{ fontSize: 14, color: 'grey.600', textAlign: 'center', maxWidth: 320 }}>
                {t('login.otpInstructions')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }} dir="ltr">
                {otpDigits.map((d, i) => (
                  <Box
                    key={i}
                    component="input"
                    value={d}
                    onChange={(e: any) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e: any) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    ref={(el: HTMLInputElement | null) => { otpRefs.current[i] = el; }}
                    inputMode="numeric"
                    maxLength={1}
                    sx={{
                      width: 44,
                      height: 52,
                      textAlign: 'center',
                      fontSize: 24,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      border: '1px solid',
                      borderColor: d ? 'primary.main' : 'divider',
                      borderRadius: 2,
                      background: d ? 'rgba(79,70,229,0.04)' : '#fff',
                      color: 'text.primary',
                      transition: 'all 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                      outline: 'none',
                      '&:focus': {
                        borderColor: 'primary.main',
                        boxShadow: '0 0 0 4px rgba(79,70,229,0.14)',
                      },
                      '&:disabled': { opacity: 0.6 },
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
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
                sx={{ py: 1.4, fontSize: 15 }}
              >
                {t('login.verify')}
              </Button>
              <Link
                component="button"
                variant="caption"
                onClick={() => { setPhoneStep('input'); setError(''); }}
                disabled={loading}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'grey.600',
                  textDecoration: 'none',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                <BackIcon sx={{ fontSize: 14, transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                {t('login.changePhone')}
              </Link>
            </Stack>
          )}

          {/* Password */}
          {tab === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <Stack spacing={2}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 0.75 }}>
                    {t('login.username')}
                  </Typography>
                  <TextField
                    fullWidth
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    autoComplete="username"
                    placeholder={isRtl ? 'הכניסו שם משתמש' : 'Enter username'}
                  />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'grey.700', mb: 0.75 }}>
                    {t('login.password')}
                  </Typography>
                  <TextField
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((s) => !s)}
                              edge="end"
                              size="small"
                              aria-label={isRtl ? 'הצג סיסמה' : 'toggle password'}
                            >
                              {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading || !username || !password}
                  sx={{ mt: 1, py: 1.4, fontSize: 15 }}
                >
                  {loading ? (isRtl ? 'מתחבר...' : 'Signing in...') : t('login.submit')}
                </Button>
              </Stack>
            </form>
          )}

          {!showPasswordTab && (
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Link
                component="button"
                variant="caption"
                onClick={() => { setShowPasswordTab(true); setTab('password'); }}
                sx={{
                  color: 'grey.600',
                  textDecoration: 'none',
                  fontSize: 13,
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {t('login.usePassword')}
              </Link>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
