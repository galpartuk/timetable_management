import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/timetable_grid.dart';

/// Admin-only week view for any teacher (not just the logged-in one).
class TeacherWeekScreen extends ConsumerWidget {
  const TeacherWeekScreen({
    super.key,
    required this.teacherId,
    required this.teacherName,
  });

  final int teacherId;
  final String teacherName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final owner = ScheduleOwner(teacherId: teacherId);
    final schedule = ref.watch(scheduleForOwnerProvider(owner));

    return Scaffold(
      appBar: AppBar(title: Text(teacherName)),
      body: RefreshIndicator(
        onRefresh: () async =>
            ref.invalidate(scheduleForOwnerProvider(owner)),
        child: schedule.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyState(
            icon: Icons.error_outline,
            title: tr(context, 'שגיאה'),
            subtitle: '$e',
          ),
          data: (data) {
            if (data.entries.isEmpty) {
              return EmptyState(
                icon: Icons.calendar_today_outlined,
                title: tr(context, 'אין שיעורים למורה זה'),
              );
            }
            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              child: TimetableGrid(entries: data.entries),
            );
          },
        ),
      ),
    );
  }
}
