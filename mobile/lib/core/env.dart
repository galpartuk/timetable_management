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

  /// App version (matches pubspec.yaml). Hardcoded — bump when pubspec bumps.
  static const String appVersion = '0.2.0';

  /// Build timestamp injected by the build command via
  /// `--dart-define=BUILD_TIMESTAMP=...`. Local Israel time, format
  /// "yyyy-MM-dd HH:mm". Empty in IDE runs without the define.
  static const String buildTimestamp = String.fromEnvironment(
    'BUILD_TIMESTAMP',
    defaultValue: '',
  );

  /// Connect timeout for the HTTP client.
  static const Duration httpConnectTimeout = Duration(seconds: 15);

  /// Receive timeout for the HTTP client. The /timetables/{id}/quality/
  /// response can be a few MB on a fully-imported school, so this is
  /// deliberately generous.
  static const Duration httpReceiveTimeout = Duration(seconds: 30);
}
