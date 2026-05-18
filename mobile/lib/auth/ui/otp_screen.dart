import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_provider.dart';
import '../auth_state.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});
  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  int? _userId;
  String? _info;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    setState(() => _busy = true);
    final res = await ref.read(authProvider.notifier).requestOtp(_phone.text);
    setState(() {
      _busy = false;
      if (res.success) {
        _userId = res.userId;
        _info = 'שיחה נשלחה. הקלידו את הקוד שתשמעו.';
      } else {
        _info = res.message.isEmpty ? 'השיחה נכשלה' : res.message;
      }
    });
  }

  Future<void> _verify() async {
    if (_userId == null) return;
    setState(() => _busy = true);
    await ref.read(authProvider.notifier).verifyOtp(_userId!, _code.text);
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('התחברות בשיחת טלפון')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
            if (_userId != null) ...[
              const SizedBox(height: 24),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'קוד שקיבלתם'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _verify,
                child: const Text('אישור'),
              ),
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
