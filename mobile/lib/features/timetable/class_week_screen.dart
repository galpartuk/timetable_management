import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/timetable_grid.dart';

/// Admin-only week view for any class (not just the logged-in user's).
class ClassWeekScreen extends ConsumerWidget {
  const ClassWeekScreen({
    super.key,
    required this.classId,
    required this.className,
  });

  final int classId;
  final String className;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final owner = ScheduleOwner(classId: classId);
    final schedule = ref.watch(scheduleForOwnerProvider(owner));

    return Scaffold(
      appBar: AppBar(title: Text(className)),
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
                title: tr(context, 'אין שיעורים לכיתה זו'),
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
