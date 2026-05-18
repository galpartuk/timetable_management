import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'env.dart';
import 'failure.dart';

/// Single Dio instance used by all API clients. The auth token is
/// injected by an interceptor on the way out; failures are normalized
/// to `Failure` on the way back.
class DioClient {
  DioClient({
    String? Function()? tokenProvider,
    VoidCallback? onUnauthenticated,
  })  : _tokenProvider = tokenProvider,
        _onUnauthenticated = onUnauthenticated {
    _dio = Dio(BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: Env.httpConnectTimeout,
      receiveTimeout: Env.httpReceiveTimeout,
      contentType: 'application/json',
      responseType: ResponseType.json,
      // Treat 4xx as errors (default), but let the caller see the body.
      validateStatus: (s) => s != null && s >= 200 && s < 300,
    ));
    _dio.interceptors.add(_AuthInterceptor(tokenProvider, onUnauthenticated));
    if (kDebugMode) {
      _dio.interceptors.add(LogInterceptor(
        responseBody: false,
        requestBody: false,
        request: true,
        requestHeader: false,
        responseHeader: false,
        error: true,
      ));
    }
  }

  late final Dio _dio;
  final String? Function()? _tokenProvider;
  final VoidCallback? _onUnauthenticated;
  // Avoid "unused field" warning while still capturing intent that
  // these are reachable to future interceptor additions.
  // ignore: unused_element
  String? Function()? get _tp => _tokenProvider;
  // ignore: unused_element
  VoidCallback? get _ou => _onUnauthenticated;

  Dio get raw => _dio;

  /// Convenience wrapper that re-throws DioExceptions as `Failure`.
  Future<Response<T>> request<T>(
    Future<Response<T>> Function() call,
  ) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw Failure.fromDio(e);
    }
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._tokenProvider, this._onUnauthenticated);
  final String? Function()? _tokenProvider;
  final VoidCallback? _onUnauthenticated;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _tokenProvider?.call();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Token $token';
    }
    super.onRequest(options, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // Notify the app so it can clear stored credentials and route to
      // login. Don't await — let the original request fail normally so
      // the calling code can handle the failure UI.
      _onUnauthenticated?.call();
    }
    super.onError(err, handler);
  }
}
