import 'package:flutter/widgets.dart';

/// Lightweight Hebrew→English lookup. We don't use Flutter's gen-l10n
/// because all UI strings are already written in Hebrew throughout the
/// codebase — wrapping them with `tr(context, '…')` is a much smaller
/// surface change than introducing message keys for every string.
///
/// Hebrew is the primary language; English is the secondary. If a key
/// isn't in the EN map, we fall back to the Hebrew text — so missing
/// translations are visible (Hebrew bleeding into English UI) rather
/// than silently broken keys.
String tr(BuildContext context, String he) {
  final isEn = Localizations.localeOf(context).languageCode == 'en';
  if (!isEn) return he;
  return _en[he] ?? he;
}

/// Use inside `String.replaceFirst` style interpolations, where you have
/// a pattern like "X שיעורים" — pass the template with `{}` placeholders
/// and the args separately so the EN translation can reorder them.
String trf(BuildContext context, String heTemplate, List<Object?> args) {
  final raw = tr(context, heTemplate);
  var out = raw;
  for (var i = 0; i < args.length; i++) {
    out = out.replaceFirst('{$i}', '${args[i]}');
  }
  return out;
}

const Map<String, String> _en = {
  // ─── Tabs / chrome ────────────────────────────────────────────────
  'היום': 'Today',
  'השבוע': 'This Week',
  'מערכת מלאה': 'Full System',
  'ניהול': 'Admin',
  'הגדרות': 'Settings',
  'מערכת שעות': 'Timetable',

  // ─── Today / week / day ───────────────────────────────────────────
  'השיעור הבא': 'Next lesson',
  'כל היום': 'All day',
  'מתקיים עכשיו': 'In progress now',
  'בעוד {0} דקות': 'In {0} minutes',
  'בעוד {0} שעות': 'In {0} hours',
  'שיעור {0}': 'Lesson {0}',
  'אין שיעורים היום': 'No lessons today',
  'אין שיעורים ביום זה': 'No lessons on this day',
  'אין שיעורים למורה זה': 'No lessons for this teacher',
  'אין שיעורים לכיתה זו': 'No lessons for this class',
  'סוף שבוע — אין לימודים היום': 'Weekend — no lessons today',
  'נתראה ביום ראשון 👋': 'See you on Sunday 👋',
  'אין מערכת שעות אישית': 'No personal timetable',
  'הפרופיל שלך לא מקושר למורה או לכיתה.': 'Your profile is not linked to a teacher or class.',
  'הפרופיל שלך לא מקושר למורה או לכיתה.\nפנו למנהל המערכת.':
      'Your profile is not linked to a teacher or class.\nContact your administrator.',
  'בחרו מורה או כיתה כדי לצפות במערכת שלהם': 'Pick a teacher or class to view their timetable',
  'יום ראשון': 'Sunday',
  'יום שני': 'Monday',
  'יום שלישי': 'Tuesday',
  'יום רביעי': 'Wednesday',
  'יום חמישי': 'Thursday',
  'יום': 'Day', // header
  'ראשון': 'Sun',
  'שני': 'Mon',
  'שלישי': 'Tue',
  'רביעי': 'Wed',
  'חמישי': 'Thu',
  'מציג נתונים אחרונים — אין חיבור לאינטרנט': 'Showing cached data — no internet connection',
  'עכשיו': 'now',
  'שגיאה': 'Error',

  // ─── Admin / KPIs ─────────────────────────────────────────────────
  'אזור מנהל': 'Admin area',
  'תפקיד שלך אינו מאפשר גישה': 'Your role does not allow access',
  'אין מערכת פעילה': 'No active timetable',
  'יש ליצור מערכת באתר תחילה': 'Create a timetable on the web app first',
  'שיעורים': 'Lessons',
  'חלונות מורים': 'Teacher gaps',
  'חלונות ארוכים': 'Long gaps',
  'חלונות כיתות': 'Class gaps',
  'אחרי 8': 'After period 8',
  'הרצת סולבר': 'Run solver',
  'יצירה חדשה של המערכת תחליף את השיעורים הקיימים.':
      'Generating a new timetable will replace the existing lessons.',
  'הרץ': 'Run',
  '10 המורים עם הכי הרבה חלונות': 'Top 10 teachers with most gaps',
  'אין חלונות אצל אף מורה': 'No teacher has any gaps',
  'המערכת איכותית': 'High-quality timetable',
  '{0} חלונות': '{0} gaps',
  '{0} ארוכים': '{0} long',
  '{0} שיעורים · {1} ימי הוראה': '{0} lessons · {1} teaching days',
  'מערכת לכל המורים': 'All teachers timetable',
  'צפו במערכת השבועית של כל מורה': 'View each teacher\'s weekly timetable',
  'מערכת לכל הכיתות': 'All classes timetable',
  'צפו במערכת השבועית של כל כיתה': 'View each class\'s weekly timetable',
  'כל המורים': 'All Teachers',
  'כל הכיתות': 'All Classes',
  'חיפוש מורה': 'Search teacher',
  'חיפוש כיתה': 'Search class',
  'חיפוש': 'Search',
  'לא נמצאו מורים': 'No teachers found',
  'לא נמצאו כיתות': 'No classes found',
  '{0} תלמידים': '{0} students',

  // ─── View-as chip / picker ─────────────────────────────────────────
  'אני': 'Me',
  'צופה בתור: ': 'Viewing as: ',
  'מורה: {0}': 'Teacher: {0}',
  'כיתה: {0}': 'Class: {0}',
  'איפוס': 'Reset',
  'צפייה בתור': 'View as',
  'מורים': 'Teachers',
  'כיתות': 'Classes',
  'חזרה לתצוגת עצמי': 'Back to my own view',

  // ─── Settings ─────────────────────────────────────────────────────
  'שפה': 'Language',
  'עברית': 'Hebrew',
  'English': 'English',
  'אודות': 'About',
  'שרת': 'Server',
  'גרסה': 'Version',
  'יציאה': 'Log out',
  'מנהל ראשי': 'Super admin',
  'מנהל': 'Admin',
  'עורך': 'Editor',
  'צופה': 'Viewer',

  // ─── WebView / errors ──────────────────────────────────────────────
  'נכשלה טעינת המערכת': 'Failed to load the system',

  // ─── Login (OTP / password) ────────────────────────────────────────
  'התחברות': 'Sign in',
  'הזינו מספר טלפון': 'Enter phone number',
  'שליחה': 'Send',
  'הקוד נשלח לטלפון': 'Code sent to your phone',
  'אישור': 'Confirm',
  'שם משתמש': 'Username',
  'סיסמה': 'Password',
  'התחבר': 'Log in',
  'התחבר עם Google': 'Sign in with Google',
  'פג תוקף החיבור, יש להתחבר מחדש': 'Session expired — please sign in again',
};
