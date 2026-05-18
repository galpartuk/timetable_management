import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/auth_api.dart';
import '../core/dio_client.dart';
import '../core/failure.dart';
import '../models/user.dart';
import 'auth_state.dart';

/// Storage keys
const _kToken = 'auth_token';
const _kUserJson = 'auth_user_json';

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
});

/// Mutable holder for the current auth token. Lives outside the auth
/// state machine so DioClient can read it without depending on the
/// auth provider — that breaks the circular type-inference Dart used
/// to complain about.
class TokenHolder {
  String? value;
  void Function()? onUnauthenticated;
}

final tokenHolderProvider = Provider<TokenHolder>((_) => TokenHolder());

final dioClientProvider = Provider<DioClient>((ref) {
  final holder = ref.read(tokenHolderProvider);
  return DioClient(
    tokenProvider: () => holder.value,
    onUnauthenticated: () => holder.onUnauthenticated?.call(),
  );
});

final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(ref.read(dioClientProvider));
});

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final holder = ref.read(tokenHolderProvider);
  final notifier = AuthNotifier(
    ref.read(secureStorageProvider),
    () => ref.read(authApiProvider),
    holder,
  );
  holder.onUnauthenticated = notifier.onServerUnauthenticated;
  return notifier;
});

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._storage, this._apiFactory, this._tokenHolder)
      : super(const AuthState.bootstrapping()) {
    _bootstrap();
  }

  final FlutterSecureStorage _storage;
  final AuthApi Function() _apiFactory;
  final TokenHolder _tokenHolder;

  Future<void> _bootstrap() async {
    final token = await _storage.read(key: _kToken);
    if (token == null || token.isEmpty) {
      _tokenHolder.value = null;
      state = const AuthState.unauthenticated();
      return;
    }
    _tokenHolder.value = token;
    // Try to revalidate by hitting /me/. If the token is dead, fall
    // back to unauth.
    try {
      // The first /me/ call needs to use the token — set it on the
      // state so the interceptor picks it up.
      final cachedUserJson = await _storage.read(key: _kUserJson);
      if (cachedUserJson != null) {
        try {
          final user = AppUser.fromJson(
              jsonDecode(cachedUserJson) as Map<String, dynamic>);
          state = AuthState.authed(user: user, token: token);
        } catch (_) {/* fall through */}
      } else {
        state = AuthState.authed(
          user: const AppUser(
            id: 0,
            username: '',
            email: '',
            fullName: '',
            role: 'viewer',
            profile: UserProfile(role: 'viewer'),
          ),
          token: token,
        );
      }
      final me = await _apiFactory().me();
      state = AuthState.authed(user: me, token: token);
      await _storage.write(key: _kUserJson, value: jsonEncode(me.toJson()));
    } on Failure catch (f) {
      if (f.isAuth) {
        await _clear();
        state = const AuthState.unauthenticated();
      } else {
        // Network issue — keep the cached state so the app is usable
        // offline.
        // (Bootstrapping already showed cached user above.)
      }
    }
  }

  Future<void> loginWithPassword(String username, String password) async {
    state = const AuthState.loading();
    try {
      final r = await _apiFactory().loginWithPassword(username, password);
      await _persist(r.token, r.user);
      state = AuthState.authed(user: r.user, token: r.token);
    } on Failure catch (f) {
      state = AuthState.unauthenticated(error: f.message);
    }
  }

  Future<void> loginWithGoogle(String idToken) async {
    state = const AuthState.loading();
    try {
      final r = await _apiFactory().loginWithGoogle(idToken);
      await _persist(r.token, r.user);
      state = AuthState.authed(user: r.user, token: r.token);
    } on Failure catch (f) {
      state = AuthState.unauthenticated(error: f.message);
    }
  }

  Future<({bool success, int? userId, int? otpId, String message})> requestOtp(String phone) async {
    try {
      return await _apiFactory().requestOtp(phone);
    } on Failure catch (f) {
      return (success: false, userId: null, otpId: null, message: f.message);
    }
  }

  Future<void> verifyOtp(int userId, String code) async {
    state = const AuthState.loading();
    try {
      final r = await _apiFactory().verifyOtp(userId, code);
      await _persist(r.token, r.user);
      state = AuthState.authed(user: r.user, token: r.token);
    } on Failure catch (f) {
      state = AuthState.unauthenticated(error: f.message);
    }
  }

  /// Poll once for the press-1 status. Returns 'pending' / 'verified' /
  /// 'expired' / 'used' / 'not_found'. On 'verified' the user is
  /// already logged in (state flipped to AuthAuthed).
  Future<String> pollOtpStatus(int userId, int otpId) async {
    try {
      final r = await _apiFactory().otpStatus(userId, otpId);
      if (r.status == 'verified' && r.result != null) {
        await _persist(r.result!.token, r.result!.user);
        state = AuthState.authed(user: r.result!.user, token: r.result!.token);
      }
      return r.status;
    } on Failure {
      return 'pending'; // treat network blips as still-waiting
    }
  }

  Future<void> logout() async {
    try {
      await _apiFactory().logout();
    } finally {
      await _clear();
      state = const AuthState.unauthenticated();
    }
  }

  /// Called by the Dio interceptor on a 401 — wipe local state without
  /// trying to call the server (which already said we're unauthed).
  void onServerUnauthenticated() {
    _clear();
    state = const AuthState.unauthenticated(
      error: 'פג תוקף החיבור, יש להתחבר מחדש',
    );
  }

  Future<void> _persist(String token, AppUser user) async {
    _tokenHolder.value = token;
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kUserJson, value: jsonEncode(user.toJson()));
  }

  Future<void> _clear() async {
    _tokenHolder.value = null;
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kUserJson);
  }
}
