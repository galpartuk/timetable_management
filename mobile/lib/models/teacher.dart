import 'package:flutter/foundation.dart';

@immutable
class Teacher {
  const Teacher({
    required this.id,
    required this.firstName,
    required this.fullName,
    this.lastName,
    this.email,
    this.phone,
    this.dayOff,
    this.maxWeeklyHours,
  });

  final int id;
  final String firstName;
  final String? lastName;
  final String fullName;
  final String? email;
  final String? phone;
  /// 1=Sunday..5=Thursday, or null.
  final int? dayOff;
  final int? maxWeeklyHours;

  factory Teacher.fromJson(Map<String, dynamic> json) => Teacher(
        id: json['id'] as int,
        firstName: (json['first_name'] ?? '') as String,
        lastName: json['last_name'] as String?,
        fullName: (json['full_name'] ?? '') as String,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        dayOff: json['day_off'] as int?,
        maxWeeklyHours: json['max_weekly_hours'] as int?,
      );
}

@immutable
class SchoolClass {
  const SchoolClass({
    required this.id,
    required this.displayName,
    required this.gradeName,
    required this.number,
    this.classType,
    this.studentCount,
    this.homeroomTeacherId,
  });

  final int id;
  final String displayName;
  final String gradeName;
  final int number;
  final String? classType;
  final int? studentCount;
  final int? homeroomTeacherId;

  factory SchoolClass.fromJson(Map<String, dynamic> json) => SchoolClass(
        id: json['id'] as int,
        displayName: (json['display_name'] ?? '') as String,
        gradeName: (json['grade_name'] ?? '') as String,
        number: (json['number'] ?? 0) as int,
        classType: json['class_type'] as String?,
        studentCount: json['student_count'] as int?,
        homeroomTeacherId: json['homeroom_teacher'] as int?,
      );
}
