import 'package:flutter/foundation.dart';

@immutable
class UserProfile {
  const UserProfile({
    required this.role,
    this.phone,
    this.fullName,
    this.teacherId,
    this.teacherName,
    this.schoolClassId,
    this.schoolClassName,
  });

  /// Role: super_admin | admin | editor | viewer.
  final String role;
  final String? phone;
  final String? fullName;
  final int? teacherId;
  final String? teacherName;
  final int? schoolClassId;
  final String? schoolClassName;

  bool get isAdmin => role == 'super_admin' || role == 'admin';
  bool get isSuperAdmin => role == 'super_admin';

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        role: json['role'] as String? ?? 'viewer',
        phone: json['phone'] as String?,
        fullName: json['full_name'] as String?,
        teacherId: json['teacher_id'] as int?,
        teacherName: json['teacher_name'] as String?,
        schoolClassId: json['school_class_id'] as int?,
        schoolClassName: json['school_class_name'] as String?,
      );
}

@immutable
class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.fullName,
    required this.role,
    required this.profile,
    this.phone,
  });

  final int id;
  final String username;
  final String email;
  final String fullName;
  final String role;
  final String? phone;
  final UserProfile profile;

  /// Convenience getters that fall back to the profile.
  int? get teacherId => profile.teacherId;
  int? get schoolClassId => profile.schoolClassId;
  bool get isAdmin => profile.isAdmin;
  bool get isSuperAdmin => profile.isSuperAdmin;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as int,
        username: (json['username'] ?? '') as String,
        email: (json['email'] ?? '') as String,
        fullName: (json['full_name'] ?? '') as String,
        role: (json['role'] ?? 'viewer') as String,
        phone: json['phone'] as String?,
        profile: UserProfile.fromJson(
          (json['profile'] as Map<String, dynamic>?) ?? const {},
        ),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'email': email,
        'full_name': fullName,
        'role': role,
        'phone': phone,
        'profile': {
          'role': profile.role,
          'phone': profile.phone,
          'full_name': profile.fullName,
          'teacher_id': profile.teacherId,
          'teacher_name': profile.teacherName,
          'school_class_id': profile.schoolClassId,
          'school_class_name': profile.schoolClassName,
        },
      };
}
