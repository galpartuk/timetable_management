import { Box, Divider, Drawer, Fab, FormControlLabel, IconButton, Menu, MenuItem, Switch, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AutoAwesome as SparkleIcon,
  Close as CloseIcon,
  KeyboardCommandKey as CmdIcon,
  Settings as SettingsIcon,
  BoltOutlined as BoltIcon,
  DeleteSweep as DeleteSweepIcon,
} from '@mui/icons-material';
import { ChatPanel } from './ChatPanel';
import { useAiAssistant } from './AiAssistantContext';

export { AiAssistantProvider, useAiAssistantContext, useAiAssistant } from './AiAssistantContext';

const PANEL_WIDTH = 440;

const MODULE_TITLES: Record<string, { he: string; en: string }> = {
  global: { he: 'עוזר חכם', en: 'Smart Assistant' },
  timetable: { he: 'עוזר מערכת השעות', en: 'Timetable Assistant' },
  data: { he: 'עוזר ניהול הנתונים', en: 'Data Management Assistant' },
  constraints: { he: 'עוזר אילוצים', en: 'Constraints Assistant' },
  import: { he: 'עוזר ייבוא', en: 'Import Assistant' },
  admin_users: { he: 'עוזר ניהול משתמשים', en: 'User Management Assistant' },
  admin_audit: { he: 'עוזר יומני ביקורת', en: 'Audit Logs Assistant' },
  dashboard: { he: 'עוזר לוח בקרה', en: 'Dashboard Assistant' },
};

/**
 * The Command Center: a slide-out glassmorphic panel anchored opposite the
 * navigation drawer, plus a floating launcher.
 *
 * Mount this once at the layout root. Pages register their per-module
 * context via `useAiAssistantContext` and the panel reads it on send.
 */
export default function AiAssistant() {
  const { state: { ctx, isOpen, autoApprove }, close, open, setAutoApprove, requestClear } = useAiAssistant();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const L = (he: string, en: string) => (isRtl ? he : en);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const titleEntry = MODULE_TITLES[ctx.module] ?? MODULE_TITLES.global;
  const title = isRtl ? titleEntry.he : titleEntry.en;

  return (
    <>
      {/* Floating launcher — visible whenever the panel is closed. */}
      {!isOpen && (
        <Tooltip title={L('פתח עוזר חכם · Ctrl+K', 'Open Smart Assistant · Ctrl+K')} placement="top">
          <Fab
            onClick={open}
            aria-label="open AI assistant"
            sx={{
              position: 'fixed',
              bottom: { xs: 20, md: 28 },
              insetInlineEnd: { xs: 20, md: 28 },
              width: 56, height: 56,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              boxShadow: '0 14px 30px -10px rgba(79, 70, 229, 0.55), 0 6px 12px -4px rgba(79, 70, 229, 0.35)',
              transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                transform: 'translateY(-2px) scale(1.04)',
                boxShadow: '0 18px 36px -10px rgba(79, 70, 229, 0.65), 0 8px 14px -4px rgba(79, 70, 229, 0.4)',
              },
              // Subtle continuous shimmer so it reads as "magic"
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                padding: 2,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.5), transparent 50%, rgba(255,255,255,0.2))',
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                pointerEvents: 'none',
                opacity: 0.6,
              },
              zIndex: (t) => t.zIndex.fab,
            }}
          >
            <SparkleIcon />
          </Fab>
        </Tooltip>
      )}

      {/* Slide-out Command Center */}
      <Drawer
        anchor="right"
        open={isOpen}
        onClose={close}
        // Keep the panel mounted so chat history survives toggles.
        ModalProps={{ keepMounted: true }}
        slotProps={{
          backdrop: {
            sx: {
              background: 'rgba(15, 23, 42, 0.20)',
              backdropFilter: 'blur(2px)',
            },
          },
        }}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: PANEL_WIDTH },
            background: 'rgba(255, 255, 255, 0.78)',
            backdropFilter: 'saturate(180%) blur(24px)',
            WebkitBackdropFilter: 'saturate(180%) blur(24px)',
            borderColor: 'divider',
            boxShadow: '0 32px 64px -20px rgba(15, 23, 42, 0.20)',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 2.5, py: 2,
            borderBottom: '1px solid', borderColor: 'divider',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 100%)',
          }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 2.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              boxShadow: '0 6px 16px -6px rgba(79, 70, 229, 0.6)',
            }}>
              <SparkleIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {title}
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'grey.600', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CmdIcon sx={{ fontSize: 12 }} /> {L('+ K לפתיחה מהירה', '+ K for quick open')}
              </Typography>
            </Box>
            <Tooltip title={L('הגדרות עוזר', 'Assistant settings')}>
              <IconButton size="small" onClick={(e) => setSettingsAnchor(e.currentTarget)} aria-label="assistant settings">
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={close} aria-label="close assistant">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Menu
            anchorEl={settingsAnchor}
            open={!!settingsAnchor}
            onClose={() => setSettingsAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 280 } } }}
          >
            <MenuItem disableRipple sx={{ alignItems: 'flex-start', flexDirection: 'column', py: 1.25 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoApprove}
                    onChange={(_, on) => setAutoApprove(on)}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{L('אישור אוטומטי', 'Auto-approve')}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'grey.600' }}>
                      {L(
                        'פעולות יבוצעו בלי כרטיס אישור. כל שינוי נשמר ב"ניהול גרסאות" וניתן לשחזר.',
                        'Actions run without a confirmation card. Every change is saved in "Version history" and can be restored.',
                      )}
                    </Typography>
                  </Box>
                }
                sx={{ ml: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.25 } }}
              />
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                if (confirm(L('למחוק את היסטוריית השיחה? הפעולה אינה הפיכה.', 'Delete the chat history? This action cannot be undone.'))) {
                  requestClear();
                  setSettingsAnchor(null);
                }
              }}
              sx={{ color: 'error.main', gap: 1 }}
            >
              <DeleteSweepIcon fontSize="small" />
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{L('מחק את היסטוריית השיחה', 'Delete chat history')}</Typography>
                <Typography sx={{ fontSize: 11, color: 'grey.600' }}>
                  {L(
                    'השיחה נשמרת בדפדפן שלכם ועוברת ריענון. מחיקה תאפס את ההיסטוריה.',
                    'The chat is saved in your browser and survives reloads. Deleting it will reset the history.',
                  )}
                </Typography>
              </Box>
            </MenuItem>
          </Menu>

          {/* Banner when auto-approve is on, so the user is never surprised. */}
          {autoApprove && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1,
              background: 'rgba(245,158,11,0.12)',
              color: '#92400e',
              borderBottom: '1px solid rgba(245,158,11,0.30)',
              fontSize: 12, fontWeight: 600,
            }}>
              <BoltIcon sx={{ fontSize: 16 }} />
              <Box sx={{ flex: 1 }}>
                {isRtl ? (
                  <>
                    אישור אוטומטי פעיל — פעולות יבוצעו ללא כרטיסי אישור.
                    ניתן לשחזר ב<a href="/history" style={{ color: 'inherit', textDecoration: 'underline' }}>ניהול גרסאות</a>.
                  </>
                ) : (
                  <>
                    Auto-approve is on — actions will run without confirmation cards.
                    You can restore them in <a href="/history" style={{ color: 'inherit', textDecoration: 'underline' }}>Version history</a>.
                  </>
                )}
              </Box>
            </Box>
          )}

          {/* Mounted once so chat state survives drawer toggles. Persistence
              across page reloads is handled by useAiAssistantChat (localStorage). */}
          <ChatPanel ctx={ctx} />
        </Box>
      </Drawer>
    </>
  );
}
