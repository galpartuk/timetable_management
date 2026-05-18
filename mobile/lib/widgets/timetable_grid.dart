import 'package:flutter/material.dart';

import '../models/timetable_entry.dart';

const _dayLabels = {1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה'};

/// Compact week grid suitable for phones: periods as rows, days as
/// columns. Sunday on the right (RTL), Thursday on the left.
class TimetableGrid extends StatelessWidget {
  const TimetableGrid({
    super.key,
    required this.entries,
    this.maxPeriod = 10,
    this.onTapDay,
  });

  final List<TimetableEntry> entries;
  final int maxPeriod;
  final void Function(int day)? onTapDay;

  @override
  Widget build(BuildContext context) {
    // Bucket by (day, period) — pooled lessons can have multiple
    // entries per cell (we just show the first; the day view shows all).
    final byCell = <String, TimetableEntry>{};
    for (final e in entries) {
      byCell['${e.day}-${e.period}'] ??= e;
    }

    return LayoutBuilder(builder: (context, constraints) {
      // 5 days + 1 period-number column = 6 columns.
      final cellWidth = (constraints.maxWidth - 56) / 5;
      const cellHeight = 62.0;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header row
          Row(
            children: [
              const SizedBox(width: 36),
              for (var d = 1; d <= 5; d++)
                Expanded(
                  child: GestureDetector(
                    onTap: () => onTapDay?.call(d),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      alignment: Alignment.center,
                      child: Text(
                        _dayLabels[d]!,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (var p = 1; p <= maxPeriod; p++)
            _PeriodRow(
              period: p,
              cellWidth: cellWidth,
              cellHeight: cellHeight,
              byCell: byCell,
              onTapDay: onTapDay,
            ),
        ],
      );
    });
  }
}

class _PeriodRow extends StatelessWidget {
  const _PeriodRow({
    required this.period,
    required this.cellWidth,
    required this.cellHeight,
    required this.byCell,
    this.onTapDay,
  });
  final int period;
  final double cellWidth;
  final double cellHeight;
  final Map<String, TimetableEntry> byCell;
  final void Function(int day)? onTapDay;

  @override
  Widget build(BuildContext context) {
    final outline = Theme.of(context).colorScheme.outline;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 36,
            child: Center(
              child: Text(
                '$period',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  color: outline,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          for (var d = 1; d <= 5; d++)
            Expanded(
              child: _Cell(
                entry: byCell['$d-$period'],
                width: cellWidth,
                height: cellHeight,
                onTap: () => onTapDay?.call(d),
              ),
            ),
        ],
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.entry,
    required this.width,
    required this.height,
    this.onTap,
  });
  final TimetableEntry? entry;
  final double width;
  final double height;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    if (e == null) {
      return Container(
        height: height,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: const Color(0xFFF8F9FB),
        ),
      );
    }
    final color = e.subjectColor;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: color.withValues(alpha: 0.10),
          border: Border.all(color: color.withValues(alpha: 0.20)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              e.subjectName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w800,
                fontSize: 10.5,
                height: 1.1,
              ),
            ),
            Text(
              e.teacherName.isNotEmpty ? e.teacherName : e.className,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, height: 1.2),
            ),
          ],
        ),
      ),
    );
  }
}
