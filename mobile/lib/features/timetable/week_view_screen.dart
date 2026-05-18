import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../state/view_as.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/timetable_grid.dart';
import '../../widgets/view_as_chip.dart';
import 'day_view_screen.dart';

class WeekViewScreen extends ConsumerWidget {
  const WeekViewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed) return const SizedBox.shrink();
    final user = auth.user;
    final viewAs = ref.watch(viewAsProvider);
    final ScheduleOwner? owner = (viewAs != null && user.isAdmin)
        ? viewAs.toOwner()
        : (user.teacherId != null || user.schoolClassId != null
            ? ScheduleOwner(
                teacherId: user.teacherId,
                classId: user.schoolClassId,
              )
            : null);
    if (owner == null) {
      return Column(
        children: [
          const ViewAsChip(),
          Expanded(
            child: EmptyState(
              icon: Icons.person_off_outlined,
              title: tr(context, 'אין מערכת שעות אישית'),
              subtitle: user.isAdmin
                  ? tr(context, 'בחרו מורה או כיתה כדי לצפות במערכת שלהם')
                  : tr(context, 'הפרופיל שלך לא מקושר למורה או לכיתה.'),
            ),
          ),
        ],
      );
    }
    final schedule = ref.watch(scheduleForOwnerProvider(owner));

    return Column(
      children: [
        const ViewAsChip(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async =>
                ref.invalidate(scheduleForOwnerProvider(owner)),
            child: schedule.when(
              data: (data) => SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
                child: TimetableGrid(
                  entries: data.entries,
                  // Day drill-down assumes the auth user's own owner;
                  // disable it when an admin overrides the view.
                  onTapDay: viewAs == null
                      ? (day) {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => DayViewScreen(day: day),
                            ),
                          );
                        }
                      : null,
                ),
              ),
              error: (e, _) => EmptyState(
                icon: Icons.error_outline,
                title: tr(context, 'שגיאה'),
                subtitle: '$e',
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
          ),
        ),
      ],
    );
  }
}
