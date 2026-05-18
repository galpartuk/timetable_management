import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/env.dart';
import '../auth_provider.dart';
import '../auth_state.dart';
import 'otp_screen.dart';

/// Single login screen with three methods: Google, phone OTP, password.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _showPasswordForm = false;
  final _username = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authProvider);
    final isLoading = state is AuthLoading;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                _Hero(),
                const SizedBox(height: 32),
                if (state is AuthUnauthenticated && state.error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      state.error!,
                      style: const TextStyle(color: Color(0xFFB91C1C)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_showPasswordForm) ...[
                  _PasswordForm(
                    username: _username,
                    password: _password,
                    onCancel: () => setState(() => _showPasswordForm = false),
                    onLogin: () => ref
                        .read(authProvider.notifier)
                        .loginWithPassword(_username.text, _password.text),
                    isLoading: isLoading,
                  ),
                ] else ...[
                  FilledButton.icon(
                    onPressed: isLoading
                        ? null
                        : () => _onGoogleLoginPressed(context),
                    icon: const Icon(Icons.account_circle),
                    label: const Text('התחברות עם Google'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: isLoading
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const OtpScreen(),
                              ),
                            ),
                    icon: const Icon(Icons.phone),
                    label: const Text('התחברות עם שיחת טלפון'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: isLoading
                        ? null
                        : () => setState(() => _showPasswordForm = true),
                    child: const Text('שם משתמש וסיסמה'),
                  ),
                ],
                const SizedBox(height: 32),
                Text(
                  Env.apiBaseUrl,
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.outline,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _onGoogleLoginPressed(BuildContext context) async {
    // The actual google_sign_in flow requires per-platform client IDs.
    // We stub here with a helpful message so the build works even
    // when those IDs aren't configured yet; in production replace with:
    //
    //   final account = await GoogleSignIn(clientId: …).signIn();
    //   final auth = await account!.authentication;
    //   await ref.read(authProvider.notifier).loginWithGoogle(auth.idToken!);
    if (Env.googleClientIdIos.isEmpty && Env.googleClientIdAndroid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Google Sign-In לא הוגדר עדיין — יש להגדיר GOOGLE_CLIENT_ID_IOS/ANDROID בבילד.',
          ),
        ),
      );
      return;
    }
    // TODO: wire google_sign_in here once client IDs are provided.
  }
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 88,
          height: 88,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary,
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Icon(Icons.calendar_month, color: Colors.white, size: 44),
        ),
        const SizedBox(height: 16),
        Text(
          'מערכת שעות',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          'לכניסה למערכת שלכם',
          style: TextStyle(
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
      ],
    );
  }
}

class _PasswordForm extends StatelessWidget {
  const _PasswordForm({
    required this.username,
    required this.password,
    required this.onCancel,
    required this.onLogin,
    required this.isLoading,
  });
  final TextEditingController username;
  final TextEditingController password;
  final VoidCallback onCancel;
  final VoidCallback onLogin;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: username,
          decoration: const InputDecoration(labelText: 'שם משתמש'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: password,
          decoration: const InputDecoration(labelText: 'סיסמה'),
          obscureText: true,
          onSubmitted: (_) => onLogin(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: isLoading ? null : onLogin,
          child: isLoading
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text('התחברות'),
        ),
        TextButton(onPressed: onCancel, child: const Text('חזור')),
      ],
    );
  }
}
