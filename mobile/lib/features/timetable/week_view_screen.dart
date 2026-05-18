import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/timetable_grid.dart';
import 'day_view_screen.dart';

class WeekViewScreen extends ConsumerWidget {
  const WeekViewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed) return const SizedBox.shrink();
    final teacherId = auth.user.teacherId;
    final classId = auth.user.schoolClassId;
    if (teacherId == null && classId == null) {
      return EmptyState(
        icon: Icons.person_off_outlined,
        title: 'אין מערכת שעות אישית',
        subtitle: 'הפרופיל שלך לא מקושר למורה או לכיתה.',
      );
    }
    final owner = ScheduleOwner(teacherId: teacherId, classId: classId);
    final schedule = ref.watch(scheduleForOwnerProvider(owner));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(scheduleForOwnerProvider(owner)),
      child: schedule.when(
        data: (data) => Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          child: TimetableGrid(
            entries: data.entries,
            onTapDay: (day) {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => DayViewScreen(day: day),
                ),
              );
            },
          ),
        ),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline,
          title: 'שגיאה',
          subtitle: '$e',
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}
