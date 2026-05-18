import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_provider.dart';
import '../auth_state.dart';

/// Press-1 OTP flow:
///   1. User enters phone → tap "send call"
///   2. We dial them; the call says "press 1 to confirm"
///   3. While they press, the screen polls /otp-status/ every 1.5s
///   4. On 'verified' the AuthNotifier flips to authed and the router
///      redirects us out of this screen automatically.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});
  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  int? _userId;
  int? _otpId;
  String? _info;
  bool _busy = false;
  Timer? _pollTimer;
  bool _showManualEntry = false;

  @override
  void dispose() {
    _pollTimer?.cancel();
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    setState(() => _busy = true);
    final res = await ref.read(authProvider.notifier).requestOtp(_phone.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (res.success) {
        _userId = res.userId;
        _otpId = res.otpId;
        _info = 'מצלצלים אליך — לחץ 1 לאישור.';
        _startPolling();
      } else {
        _info = res.message.isEmpty ? 'השיחה נכשלה' : res.message;
      }
    });
  }

  void _startPolling() {
    _pollTimer?.cancel();
    final uid = _userId;
    final oid = _otpId;
    if (uid == null || oid == null) return;
    _pollTimer = Timer.periodic(const Duration(milliseconds: 1500), (t) async {
      if (!mounted) {
        t.cancel();
        return;
      }
      final status = await ref.read(authProvider.notifier).pollOtpStatus(uid, oid);
      if (!mounted) return;
      if (status == 'verified') {
        t.cancel();
        // AuthNotifier already flipped to authed; the router will leave us.
      } else if (status == 'expired' || status == 'used') {
        t.cancel();
        setState(() {
          _info = 'התוקף פג. נסה שוב.';
          _userId = null;
          _otpId = null;
        });
      }
    });
  }

  Future<void> _verifyManually() async {
    if (_userId == null) return;
    setState(() => _busy = true);
    _pollTimer?.cancel();
    await ref.read(authProvider.notifier).verifyOtp(_userId!, _code.text);
    if (!mounted) return;
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authProvider);
    final waitingForPress = _userId != null && _otpId != null;
    return Scaffold(
      appBar: AppBar(title: const Text('התחברות בשיחת טלפון')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!waitingForPress) ...[
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'מספר טלפון'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _requestOtp,
                child: const Text('שלח לי שיחה'),
              ),
            ] else ...[
              const SizedBox(height: 8),
              Center(
                child: SizedBox(
                  width: 88,
                  height: 88,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Icon(Icons.phone_in_talk, size: 36),
                      const CircularProgressIndicator(strokeWidth: 2.5),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'מצלצלים אליך כעת',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              const Text(
                'ענה לשיחה ולחץ 1 כדי לאשר את ההתחברות.\nהמסך יתעדכן אוטומטית.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              if (!_showManualEntry)
                TextButton(
                  onPressed: () => setState(() => _showManualEntry = true),
                  child: const Text('אני מעדיף להקליד קוד'),
                )
              else ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'קוד'),
                  onSubmitted: (_) => _verifyManually(),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _busy ? null : _verifyManually,
                  child: const Text('אישור'),
                ),
              ],
            ],
            if (_info != null) ...[
              const SizedBox(height: 16),
              Text(_info!, textAlign: TextAlign.center),
            ],
            if (state is AuthUnauthenticated && state.error != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  state.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFB91C1C)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
