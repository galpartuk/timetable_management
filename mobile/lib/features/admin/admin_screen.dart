import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import 'all_classes_screen.dart';
import 'all_teachers_screen.dart';

final qualityProvider = FutureProvider.family<Map<String, dynamic>, int>(
    (ref, timetableId) async {
  return ref.read(timetableApiProvider).quality(timetableId);
});

class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed || !auth.user.isAdmin) {
      return EmptyState(
        icon: Icons.lock_outline,
        title: tr(context, 'אזור מנהל'),
        subtitle: tr(context, 'תפקיד שלך אינו מאפשר גישה'),
      );
    }
    final active = ref.watch(activeTimetableProvider);
    return active.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: tr(context, 'שגיאה'),
        subtitle: '$e',
      ),
      data: (tt) {
        if (tt == null) {
          return EmptyState(
            icon: Icons.calendar_today_outlined,
            title: tr(context, 'אין מערכת פעילה'),
            subtitle: tr(context, 'יש ליצור מערכת באתר תחילה'),
          );
        }
        return _AdminBody(timetableId: tt.id, timetableName: tt.name);
      },
    );
  }
}

class _AdminBody extends ConsumerWidget {
  const _AdminBody({required this.timetableId, required this.timetableName});
  final int timetableId;
  final String timetableName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quality = ref.watch(qualityProvider(timetableId));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(qualityProvider(timetableId)),
      child: quality.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline,
          title: 'שגיאה',
          subtitle: '$e',
        ),
        data: (q) => _renderQuality(context, ref, q),
      ),
    );
  }

  Widget _renderQuality(BuildContext context, WidgetRef ref, Map<String, dynamic> q) {
    final totals = (q['totals'] as Map<String, dynamic>?) ?? const {};
    final teachers = (q['teachers'] as List<dynamic>?) ?? const [];
    final running = ref.watch(_solverBusyProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text(
          timetableName,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _Kpi(
              label: tr(context, 'שיעורים'),
              value: (totals['entries'] ?? 0).toString(),
              tone: _Tone.primary,
            ),
            _Kpi(
              label: tr(context, 'חלונות מורים'),
              value: (totals['total_teacher_windows'] ?? 0).toString(),
              tone: _gradeTone(totals['total_teacher_windows'] ?? 0, 30, 100),
            ),
            _Kpi(
              label: tr(context, 'חלונות ארוכים'),
              value: (totals['total_long_windows'] ?? 0).toString(),
              tone: (totals['total_long_windows'] ?? 0) == 0
                  ? _Tone.good
                  : _Tone.bad,
            ),
            _Kpi(
              label: tr(context, 'חלונות כיתות'),
              value: (totals['total_class_windows'] ?? 0).toString(),
              tone: _gradeTone(totals['total_class_windows'] ?? 0, 10, 50),
            ),
            _Kpi(
              label: tr(context, 'אחרי 8'),
              value: (totals['late_period_lessons'] ?? 0).toString(),
              tone: _Tone.warn,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr(context, 'הרצת סולבר'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        tr(context, 'יצירה חדשה של המערכת תחליף את השיעורים הקיימים.'),
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                ),
                FilledButton(
                  onPressed: running
                      ? null
                      : () async {
                          ref.read(_solverBusyProvider.notifier).state = true;
                          try {
                            await ref
                                .read(timetableApiProvider)
                                .runSolver(timetableId);
                            ref.invalidate(qualityProvider(timetableId));
                            ref.invalidate(scheduleForOwnerProvider);
                          } finally {
                            ref.read(_solverBusyProvider.notifier).state = false;
                          }
                        },
                  child: running
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : Text(tr(context, 'הרץ')),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.groups_outlined),
            title: Text(
              tr(context, 'מערכת לכל המורים'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(tr(context, 'צפו במערכת השבועית של כל מורה')),
            trailing: const Icon(Icons.chevron_left),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AllTeachersScreen()),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.class_outlined),
            title: Text(
              tr(context, 'מערכת לכל הכיתות'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(tr(context, 'צפו במערכת השבועית של כל כיתה')),
            trailing: const Icon(Icons.chevron_left),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AllClassesScreen()),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Text(
          tr(context, '10 המורים עם הכי הרבה חלונות'),
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        ...teachers
            .cast<Map<String, dynamic>>()
            .where((t) => (t['windows'] ?? 0) > 0)
            .take(10)
            .map((t) => _TeacherTile(t: t)),
        if (teachers.cast<Map<String, dynamic>>().every((t) => (t['windows'] ?? 0) == 0))
          EmptyState(
            icon: Icons.check_circle_outline,
            title: tr(context, 'אין חלונות אצל אף מורה'),
            subtitle: tr(context, 'המערכת איכותית'),
          ),
      ],
    );
  }
}

final _solverBusyProvider = StateProvider<bool>((_) => false);

enum _Tone { primary, good, warn, bad }

_Tone _gradeTone(num value, int goodAt, int warnAt) {
  if (value < goodAt) return _Tone.good;
  if (value < warnAt) return _Tone.warn;
  return _Tone.bad;
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value, required this.tone});
  final String label;
  final String value;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      _Tone.primary => (const Color(0xFFE0E7FF), const Color(0xFF4338CA)),
      _Tone.good => (const Color(0xFFD1FAE5), const Color(0xFF047857)),
      _Tone.warn => (const Color(0xFFFEF3C7), const Color(0xFFB45309)),
      _Tone.bad => (const Color(0xFFFEE2E2), const Color(0xFFBE123C)),
    };
    return Container(
      width: 108,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: fg,
              )),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: fg,
              )),
        ],
      ),
    );
  }
}

class _TeacherTile extends StatelessWidget {
  const _TeacherTile({required this.t});
  final Map<String, dynamic> t;

  @override
  Widget build(BuildContext context) {
    final windows = (t['windows'] ?? 0) as int;
    final longW = (t['long_windows'] ?? 0) as int;
    final color = windows >= 5
        ? const Color(0xFFBE123C)
        : windows >= 3
            ? const Color(0xFFB45309)
            : const Color(0xFF854D0E);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Card(
        child: ListTile(
          title: Text(
            (t['name'] ?? '') as String,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          ),
          subtitle: Text(
            trf(context, '{0} שיעורים · {1} ימי הוראה', [t['lessons'], t['days_taught']]),
            style: const TextStyle(fontSize: 12),
          ),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                trf(context, '{0} חלונות', [windows]),
                style: TextStyle(color: color, fontWeight: FontWeight.w800),
              ),
              if (longW > 0)
                Text(
                  trf(context, '{0} ארוכים', [longW]),
                  style: const TextStyle(
                    color: Color(0xFFBE123C),
                    fontSize: 11,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
