import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_provider.dart';
import '../auth/auth_state.dart';
import '../auth/ui/login_screen.dart';
import '../features/dashboard/dashboard_screen.dart';

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  // Listen to authProvider state, and notify go_router on any change so
  // the redirect handler re-runs.
  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthRouterListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loc = state.matchedLocation;
      if (auth is AuthBootstrapping) {
        return loc == '/splash' ? null : '/splash';
      }
      final isAuthed = auth is AuthAuthed;
      final onLogin = loc == '/login';
      if (!isAuthed && !onLogin) return '/login';
      if (isAuthed && (onLogin || loc == '/splash')) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/', builder: (_, __) => const DashboardScreen()),
    ],
  );
});

class _AuthRouterListenable extends ChangeNotifier {
  _AuthRouterListenable(this._ref) {
    _ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}
