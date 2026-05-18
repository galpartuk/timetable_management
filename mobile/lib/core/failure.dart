import 'package:dio/dio.dart';

/// All failures the app can surface to a user, as a sealed family.
/// Map DioException → Failure via `Failure.fromDio` in one place so
/// every screen renders the same Hebrew message for the same shape.
sealed class Failure implements Exception {
  const Failure(this.message);
  final String message;

  /// Network error — phone is offline, server unreachable, timeout.
  factory Failure.network([String? detail]) =>
      _NetworkFailure(detail ?? 'אין חיבור לאינטרנט');

  /// 401/403 — token invalid/expired or insufficient permission.
  factory Failure.auth([String? detail]) =>
      _AuthFailure(detail ?? 'נדרשת התחברות מחודשת');

  /// 404 — resource missing.
  factory Failure.notFound([String? detail]) =>
      _NotFoundFailure(detail ?? 'הנתון לא נמצא');

  /// 5xx — server error.
  factory Failure.server(String detail) => _ServerFailure(detail);

  /// Anything else.
  factory Failure.unknown([String? detail]) =>
      _UnknownFailure(detail ?? 'שגיאה לא ידועה');

  /// Map a DioException to the appropriate Failure subtype. Server
  /// error bodies are expected to be JSON with an "error" field (the
  /// Django backend's convention).
  factory Failure.fromDio(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.connectionError) {
      return Failure.network();
    }
    final status = e.response?.statusCode;
    final detail = _extractErrorMessage(e.response?.data);
    if (status == 401 || status == 403) {
      return Failure.auth(detail);
    }
    if (status == 404) {
      return Failure.notFound(detail);
    }
    if (status != null && status >= 500) {
      return Failure.server(detail ?? 'שגיאה בשרת');
    }
    return Failure.unknown(detail);
  }

  bool get isAuth => this is _AuthFailure;
  bool get isNetwork => this is _NetworkFailure;
}

class _NetworkFailure extends Failure {
  const _NetworkFailure(super.message);
}

class _AuthFailure extends Failure {
  const _AuthFailure(super.message);
}

class _NotFoundFailure extends Failure {
  const _NotFoundFailure(super.message);
}

class _ServerFailure extends Failure {
  const _ServerFailure(super.message);
}

class _UnknownFailure extends Failure {
  const _UnknownFailure(super.message);
}

String? _extractErrorMessage(Object? body) {
  if (body is Map<String, Object?>) {
    final err = body['error'];
    if (err is String && err.isNotEmpty) return err;
    final detail = body['detail'];
    if (detail is String && detail.isNotEmpty) return detail;
  }
  return null;
}
