import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/timetable_repository.dart';

/// Admin "view as" override for Today / Weekly screens. When set, those
/// screens pull the chosen teacher's or class's schedule instead of the
/// signed-in user's own. Held in-memory; resets on app relaunch.
@immutable
class ViewAs {
  const ViewAs.teacher({required int id, required String name})
      : teacherId = id,
        teacherName = name,
        classId = null,
        className = null;

  const ViewAs.classroom({required int id, required String name})
      : teacherId = null,
        teacherName = null,
        classId = id,
        className = name;

  final int? teacherId;
  final String? teacherName;
  final int? classId;
  final String? className;

  String get displayName =>
      teacherName ?? className ?? '';

  bool get isTeacher => teacherId != null;

  ScheduleOwner toOwner() =>
      ScheduleOwner(teacherId: teacherId, classId: classId);
}

/// null = view your own schedule (default).
final viewAsProvider = StateProvider<ViewAs?>((_) => null);
