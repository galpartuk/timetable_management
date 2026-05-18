import 'package:flutter/foundation.dart';

import '../models/user.dart';

/// Bootstrapping → loading → authed/unauthenticated.
sealed class AuthState {
  const AuthState();
  const factory AuthState.bootstrapping() = AuthBootstrapping;
  const factory AuthState.unauthenticated({String? error}) = AuthUnauthenticated;
  const factory AuthState.loading() = AuthLoading;
  const factory AuthState.authed({
    required AppUser user,
    required String token,
  }) = AuthAuthed;
}

class AuthBootstrapping extends AuthState {
  const AuthBootstrapping();
}

@immutable
class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.error});
  final String? error;
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

@immutable
class AuthAuthed extends AuthState {
  const AuthAuthed({required this.user, required this.token});
  final AppUser user;
  final String token;
}
