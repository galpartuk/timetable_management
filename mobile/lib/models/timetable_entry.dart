import 'package:flutter/material.dart';

@immutable
class TimetableEntry {
  const TimetableEntry({
    required this.id,
    required this.day,
    required this.period,
    required this.subjectName,
    required this.subjectColorHex,
    required this.teacherName,
    required this.className,
    this.locked = false,
    this.teacherId,
    this.schoolClassId,
    this.subjectId,
  });

  final int id;
  /// 1=Sunday, 2=Monday, ..., 5=Thursday
  final int day;
  final int period;
  final String subjectName;
  final String subjectColorHex;
  final String teacherName;
  final String className;
  final bool locked;
  final int? teacherId;
  final int? schoolClassId;
  final int? subjectId;

  Color get subjectColor {
    final hex = subjectColorHex.replaceAll('#', '');
    if (hex.length != 6) return const Color(0xFF6366F1);
    return Color(int.parse('FF$hex', radix: 16));
  }

  factory TimetableEntry.fromJson(Map<String, dynamic> json) => TimetableEntry(
        id: json['id'] as int,
        day: json['day'] as int,
        period: json['period'] as int,
        subjectName: (json['subject_name'] ?? '') as String,
        subjectColorHex: (json['subject_color'] ?? '#6366F1') as String,
        teacherName: (json['teacher_name'] ?? '') as String,
        className: (json['class_name'] ?? '') as String,
        locked: (json['locked'] ?? false) as bool,
        teacherId: json['teacher'] as int?,
        schoolClassId: json['school_class'] as int?,
        subjectId: json['subject'] as int?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'day': day,
        'period': period,
        'subject_name': subjectName,
        'subject_color': subjectColorHex,
        'teacher_name': teacherName,
        'class_name': className,
        'locked': locked,
        'teacher': teacherId,
        'school_class': schoolClassId,
        'subject': subjectId,
      };
}
