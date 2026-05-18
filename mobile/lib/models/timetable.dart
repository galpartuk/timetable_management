import 'package:flutter/foundation.dart';

@immutable
class Timetable {
  const Timetable({
    required this.id,
    required this.name,
    required this.academicYear,
    required this.status,
    this.entryCount = 0,
    this.createdAt,
  });

  final int id;
  final String name;
  final String academicYear;
  /// draft | generating | completed | failed | published
  final String status;
  final int entryCount;
  final DateTime? createdAt;

  factory Timetable.fromJson(Map<String, dynamic> json) => Timetable(
        id: json['id'] as int,
        name: (json['name'] ?? '') as String,
        academicYear: (json['academic_year'] ?? '') as String,
        status: (json['status'] ?? 'draft') as String,
        entryCount: (json['entry_count'] ?? 0) as int,
        createdAt: json['created_at'] != null
            ? DateTime.tryParse(json['created_at'] as String)
            : null,
      );
}

@immutable
class TimeSlot {
  const TimeSlot({
    required this.id,
    required this.day,
    required this.period,
    required this.startTime,
    required this.endTime,
  });

  final int id;
  final int day; // 1=Sunday..5=Thursday
  final int period;
  /// "HH:MM:SS" string from Django.
  final String startTime;
  final String endTime;

  /// Returns (hour, minute) parsed from startTime.
  ({int hour, int minute}) get startHM => _parse(startTime);
  ({int hour, int minute}) get endHM => _parse(endTime);

  static ({int hour, int minute}) _parse(String s) {
    final parts = s.split(':');
    return (
      hour: int.tryParse(parts[0]) ?? 0,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
    );
  }

  factory TimeSlot.fromJson(Map<String, dynamic> json) => TimeSlot(
        id: json['id'] as int,
        day: json['day'] as int,
        period: json['period'] as int,
        startTime: (json['start_time'] ?? '08:00:00') as String,
        endTime: (json['end_time'] ?? '08:45:00') as String,
      );
}
