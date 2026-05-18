/// Compile-time environment constants. Override via
/// `flutter run --dart-define=API_BASE_URL=https://staging.example.com`.
class Env {
  /// Base URL for the Django backend (no trailing slash). The
  /// production deployment is the default; CI/dev can override.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://timetable.all-good.co.il',
  );

  /// Google OAuth client ID for iOS. Set via --dart-define in CI.
  static const String googleClientIdIos = String.fromEnvironment(
    'GOOGLE_CLIENT_ID_IOS',
    defaultValue: '',
  );

  /// Google OAuth client ID for Android.
  static const String googleClientIdAndroid = String.fromEnvironment(
    'GOOGLE_CLIENT_ID_ANDROID',
    defaultValue: '',
  );

  /// Connect timeout for the HTTP client.
  static const Duration httpConnectTimeout = Duration(seconds: 15);

  /// Receive timeout for the HTTP client. The /timetables/{id}/quality/
  /// response can be a few MB on a fully-imported school, so this is
  /// deliberately generous.
  static const Duration httpReceiveTimeout = Duration(seconds: 30);
}
