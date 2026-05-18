import 'package:flutter/material.dart';

import '../models/timetable_entry.dart';

/// Card showing one lesson — subject + teacher/class + period times.
class LessonCard extends StatelessWidget {
  const LessonCard({
    super.key,
    required this.entry,
    this.startTime,
    this.endTime,
    this.subText,
  });
  final TimetableEntry entry;
  final String? startTime;
  final String? endTime;

  /// What to show under the subject. Defaults to teacher (for class
  /// view) or class (for teacher view) — pass explicitly for the
  /// "today" hero card etc.
  final String? subText;

  @override
  Widget build(BuildContext context) {
    final color = entry.subjectColor;
    final lower = subText ?? entry.teacherName;

    return Container(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(width: 4, height: 36, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.subjectName,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: color,
                  ),
                ),
                if (lower.isNotEmpty)
                  Text(
                    lower,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurface,
                      fontSize: 13,
                    ),
                  ),
              ],
            ),
          ),
          if (startTime != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  startTime!,
                  style: const TextStyle(
                    fontFeatures: [FontFeature.tabularFigures()],
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                if (endTime != null)
                  Text(
                    endTime!,
                    style: TextStyle(
                      fontFeatures: const [FontFeature.tabularFigures()],
                      color: Theme.of(context).colorScheme.outline,
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          if (entry.locked) ...[
            const SizedBox(width: 6),
            const Text('🔒', style: TextStyle(fontSize: 14)),
          ],
        ],
      ),
    );
  }
}
