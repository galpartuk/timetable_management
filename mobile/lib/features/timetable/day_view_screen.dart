import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../features/today/today_screen.dart';
import '../../i18n/tr.dart';
import '../../models/timetable.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/lesson_card.dart';

class DayViewScreen extends ConsumerWidget {
  const DayViewScreen({super.key, required this.day});
  final int day; // 1=Sunday..5=Thursday

  static const _names = {
    1: 'יום ראשון',
    2: 'יום שני',
    3: 'יום שלישי',
    4: 'יום רביעי',
    5: 'יום חמישי',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed) return const SizedBox.shrink();
    final owner = ScheduleOwner(
      teacherId: auth.user.teacherId,
      classId: auth.user.schoolClassId,
    );
    final schedule = ref.watch(scheduleForOwnerProvider(owner));
    final slots = ref.watch(timeSlotsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(tr(context, _names[day] ?? ''))),
      body: schedule.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline,
          title: tr(context, 'שגיאה'),
          subtitle: '$e',
        ),
        data: (data) {
          final entries = data.entries.where((e) => e.day == day).toList()
            ..sort((a, b) => a.period.compareTo(b.period));
          if (entries.isEmpty) {
            return EmptyState(
              icon: Icons.calendar_today_outlined,
              title: tr(context, 'אין שיעורים ביום זה'),
            );
          }
          final slotMap = <int, TimeSlot>{
            for (final s in slots.valueOrNull ?? const <TimeSlot>[])
              if (s.day == day) s.period: s,
          };
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            itemCount: entries.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final e = entries[i];
              return LessonCard(
                entry: e,
                startTime: _fmt(slotMap[e.period]?.startHM),
                endTime: _fmt(slotMap[e.period]?.endHM),
              );
            },
          );
        },
      ),
    );
  }

  static String? _fmt(({int hour, int minute})? hm) {
    if (hm == null) return null;
    return '${hm.hour.toString().padLeft(2, '0')}:${hm.minute.toString().padLeft(2, '0')}';
  }
}
