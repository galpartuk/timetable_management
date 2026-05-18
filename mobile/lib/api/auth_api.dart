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

  /// Triggers the IVR OTP call. Returns (success, userId).
  Future<({bool success, int? userId, String message})> requestOtp(String phone) async {
    final res = await _client.request(() => _client.raw.post(
          '/api/auth/request-otp/',
          data: {'phone': phone},
        ));
    final data = res.data as Map<String, dynamic>;
    return (
      success: (data['success'] ?? false) as bool,
      userId: data['user_id'] as int?,
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
