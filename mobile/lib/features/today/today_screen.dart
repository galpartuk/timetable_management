import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/timetable_api.dart';
import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../models/timetable.dart';
import '../../models/timetable_entry.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/lesson_card.dart';

final timeSlotsProvider = FutureProvider<List<TimeSlot>>((ref) async {
  // Reference data — rarely changes; cached via Riverpod's keep-alive.
  return ReferenceApi(ref.read(dioClientProvider)).timeSlots();
});

/// Today screen — hero "next lesson" + remaining-today list.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed) {
      return const SizedBox.shrink();
    }
    final user = auth.user;
    final teacherId = user.teacherId;
    final classId = user.schoolClassId;
    if (teacherId == null && classId == null) {
      return EmptyState(
        icon: Icons.person_off_outlined,
        title: 'אין מערכת שעות אישית',
        subtitle: 'הפרופיל שלך לא מקושר למורה או לכיתה.\nפנו למנהל המערכת.',
      );
    }
    final owner = ScheduleOwner(teacherId: teacherId, classId: classId);
    final schedule = ref.watch(scheduleForOwnerProvider(owner));
    final slots = ref.watch(timeSlotsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(scheduleForOwnerProvider(owner));
      },
      child: schedule.when(
        data: (data) => _Body(data: data, slots: slots),
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

class _Body extends StatelessWidget {
  const _Body({required this.data, required this.slots});
  final TimetableData data;
  final AsyncValue<List<TimeSlot>> slots;

  static const _dayNames = {
    1: 'ראשון',
    2: 'שני',
    3: 'שלישי',
    4: 'רביעי',
    5: 'חמישי',
  };

  @override
  Widget build(BuildContext context) {
    // Compute "today" as Sunday=1..Thursday=5; Fri/Sat are off.
    final weekday = DateTime.now().weekday; // Mon=1..Sun=7
    final today = _toSchoolDay(weekday);
    if (today == null) {
      return EmptyState(
        icon: Icons.weekend_outlined,
        title: 'סוף שבוע — אין לימודים היום',
        subtitle: 'נתראה ביום ראשון 👋',
      );
    }
    final entries = data.entries.where((e) => e.day == today).toList()
      ..sort((a, b) => a.period.compareTo(b.period));

    if (entries.isEmpty) {
      return EmptyState(
        icon: Icons.calendar_today_outlined,
        title: 'אין שיעורים היום',
        subtitle: 'יום ${_dayNames[today]}, ${DateTime.now().toString().split(" ").first}',
      );
    }

    final slotMap = <int, TimeSlot>{
      for (final s in slots.valueOrNull ?? const <TimeSlot>[])
        if (s.day == today) s.period: s,
    };

    final now = DateTime.now();
    final nextLesson = entries.firstWhere(
      (e) {
        final slot = slotMap[e.period];
        if (slot == null) return false;
        final start = slot.startHM;
        final dt = DateTime(now.year, now.month, now.day, start.hour, start.minute);
        return dt.isAfter(now);
      },
      orElse: () => entries.first,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (data.stale)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _StaleBanner(lastUpdated: data.lastUpdated),
          ),
        Text(
          'יום ${_dayNames[today]}',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(
          'השיעור הבא',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 12),
        _NextLessonHero(entry: nextLesson, slot: slotMap[nextLesson.period]),
        const SizedBox(height: 24),
        Text(
          'כל היום',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        for (final e in entries) ...[
          LessonCard(
            entry: e,
            startTime: _format(slotMap[e.period]?.startHM),
            endTime: _format(slotMap[e.period]?.endHM),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  static int? _toSchoolDay(int weekday) {
    // weekday: Mon=1..Sun=7. School: Sun=1..Thu=5.
    return switch (weekday) {
      DateTime.sunday => 1,
      DateTime.monday => 2,
      DateTime.tuesday => 3,
      DateTime.wednesday => 4,
      DateTime.thursday => 5,
      _ => null, // Friday/Saturday
    };
  }

  static String? _format(({int hour, int minute})? hm) {
    if (hm == null) return null;
    final h = hm.hour.toString().padLeft(2, '0');
    final m = hm.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _NextLessonHero extends StatelessWidget {
  const _NextLessonHero({required this.entry, this.slot});
  final TimetableEntry entry;
  final TimeSlot? slot;

  @override
  Widget build(BuildContext context) {
    final color = entry.subjectColor;
    final now = DateTime.now();
    String inText = '';
    if (slot != null) {
      final start = slot!.startHM;
      final dt = DateTime(now.year, now.month, now.day, start.hour, start.minute);
      final diff = dt.difference(now);
      if (diff.isNegative) {
        inText = 'מתקיים עכשיו';
      } else if (diff.inMinutes < 60) {
        inText = 'בעוד ${diff.inMinutes} דקות';
      } else {
        inText = 'בעוד ${diff.inHours} שעות';
      }
    }
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withValues(alpha: 0.18), color.withValues(alpha: 0.06)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'שיעור ${entry.period}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (inText.isNotEmpty)
                Text(
                  inText,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            entry.subjectName,
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Color.lerp(color, Colors.black, 0.25),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${entry.teacherName} · ${entry.className}',
            style: TextStyle(
              fontSize: 14,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          if (slot != null) ...[
            const SizedBox(height: 12),
            Text(
              '${_fmt(slot!.startHM)} – ${_fmt(slot!.endHM)}',
              style: const TextStyle(
                fontFeatures: [FontFeature.tabularFigures()],
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _fmt(({int hour, int minute}) hm) =>
      '${hm.hour.toString().padLeft(2, '0')}:${hm.minute.toString().padLeft(2, '0')}';
}

class _StaleBanner extends StatelessWidget {
  const _StaleBanner({this.lastUpdated});
  final DateTime? lastUpdated;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 18, color: Color(0xFFB45309)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              lastUpdated == null
                  ? 'מציג נתונים אחרונים — אין חיבור לאינטרנט'
                  : 'מציג נתונים אחרונים מ-${_relative(lastUpdated!)}',
              style: const TextStyle(fontSize: 12, color: Color(0xFFB45309)),
            ),
          ),
        ],
      ),
    );
  }

  static String _relative(DateTime when) {
    final diff = DateTime.now().difference(when);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return '${diff.inMinutes} דקות';
    if (diff.inHours < 24) return '${diff.inHours} שעות';
    return '${diff.inDays} ימים';
  }
}
