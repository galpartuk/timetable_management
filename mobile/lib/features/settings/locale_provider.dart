import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Locale selection — Hebrew default. In-memory for v1; v2 should
/// persist via flutter_secure_storage (already a dep).
final localeProvider = StateProvider<Locale>((ref) => const Locale('he'));
