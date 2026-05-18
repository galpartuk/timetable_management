import 'package:dio/dio.dart';

import '../core/dio_client.dart';
import '../core/failure.dart';
import '../models/user.dart';

/// Response from any login endpoint. The backend returns the User
/// payload + a token field; we unpack to AppUser + token separately.
class LoginResult {
  const LoginResult({required this.user, required this.token});
  final AppUser user;
  final String token;
}

class AuthApi {
  AuthApi(this._client);
  final DioClient _client;

  Future<LoginResult> loginWithPassword(String username, String password) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/login/',
          data: {'username': username, 'password': password},
        ));
    return _resultFrom(res);
  }

  Future<LoginResult> loginWithGoogle(String idToken) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/google/',
          data: {'credential': idToken},
        ));
    return _resultFrom(res);
  }

  /// Triggers the IVR OTP call. Returns the (success, userId, otpId) tuple.
  /// otpId is needed to poll otp-status for the press-1 confirmation.
  Future<({bool success, int? userId, int? otpId, String message})> requestOtp(String phone) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/request-otp/',
          data: {'phone': phone},
        ));
    final data = res.data as Map<String, dynamic>;
    return (
      success: (data['success'] ?? false) as bool,
      userId: data['user_id'] as int?,
      otpId: data['otp_id'] as int?,
      message: (data['message'] ?? '') as String,
    );
  }

  Future<LoginResult> verifyOtp(int userId, String code) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/verify-otp/',
          data: {'user_id': userId, 'code': code},
        ));
    return _resultFrom(res);
  }

  /// Polls the backend after request-otp. Returns one of:
  ///   - ('pending', null) — user hasn't pressed 1 yet
  ///   - ('verified', LoginResult) — login complete; LoginResult has user + token
  ///   - ('expired', null) — past TTL
  ///   - ('used', null) — already consumed
  Future<({String status, LoginResult? result})> otpStatus(int userId, int otpId) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/otp-status/',
          data: {'user_id': userId, 'otp_id': otpId},
        ));
    final data = res.data as Map<String, dynamic>;
    final status = (data['status'] ?? 'pending') as String;
    if (status == 'verified') {
      return (status: status, result: _resultFrom(res));
    }
    return (status: status, result: null);
  }

  Future<AppUser> me() async {
    final res = await _client.request(() => _client.raw.get('/api/auth/me/'));
    return AppUser.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _client.raw.post('/api/auth/logout/');
    } on DioException {
      // Swallow — server may already have invalidated the token.
    }
  }

  LoginResult _resultFrom(Response<dynamic> res) {
    final data = res.data as Map<String, dynamic>;
    final token = data['token'] as String?;
    if (token == null || token.isEmpty) {
      throw Failure.server('השרת לא החזיר טוקן כניסה');
    }
    return LoginResult(user: AppUser.fromJson(data), token: token);
  }
}
