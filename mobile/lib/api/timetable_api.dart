import '../core/dio_client.dart';
import '../models/teacher.dart';
import '../models/timetable.dart';
import '../models/timetable_entry.dart';

class TimetableApi {
  TimetableApi(this._client);
  final DioClient _client;

  Future<List<Timetable>> list() async {
    final res = await _client.request(() => _client.raw.get('/api/timetables/'));
    final results = (res.data['results'] as List<dynamic>?) ?? const [];
    return results
        .cast<Map<String, dynamic>>()
        .map(Timetable.fromJson)
        .toList();
  }

  Future<List<TimetableEntry>> byTeacher(int timetableId, int teacherId) async {
    final res = await _client.request(() => _client.raw.get(
          '/api/timetables/$timetableId/by-teacher/$teacherId/',
        ));
    return (res.data as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(TimetableEntry.fromJson)
        .toList();
  }

  Future<List<TimetableEntry>> byClass(int timetableId, int classId) async {
    final res = await _client.request(() => _client.raw.get(
          '/api/timetables/$timetableId/by-class/$classId/',
        ));
    return (res.data as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(TimetableEntry.fromJson)
        .toList();
  }

  Future<Map<String, dynamic>> quality(int timetableId) async {
    final res = await _client.request(() =>
        _client.raw.get('/api/timetables/$timetableId/quality/'));
    return res.data as Map<String, dynamic>;
  }

  Future<void> runSolver(int timetableId) async {
    await _client.request(() =>
        _client.raw.post('/api/timetables/$timetableId/generate/'));
  }
}

class ReferenceApi {
  ReferenceApi(this._client);
  final DioClient _client;

  Future<List<TimeSlot>> timeSlots() async {
    final res = await _client.request(() => _client.raw.get('/api/timeslots/'));
    final results = (res.data['results'] as List<dynamic>?) ?? const [];
    return results
        .cast<Map<String, dynamic>>()
        .map(TimeSlot.fromJson)
        .toList();
  }

  /// All teachers in the school. Follows the DRF pagination chain so the
  /// admin's all-teachers picker isn't capped at one page.
  Future<List<Teacher>> teachers() async {
    final out = <Teacher>[];
    String? path = '/api/teachers/';
    while (path != null) {
      final res = await _client.request(() => _client.raw.get(path!));
      final results = (res.data['results'] as List<dynamic>?) ?? const [];
      out.addAll(results.cast<Map<String, dynamic>>().map(Teacher.fromJson));
      final next = res.data['next'] as String?;
      if (next == null || next.isEmpty) {
        path = null;
      } else {
        final uri = Uri.parse(next);
        path = uri.hasQuery ? '${uri.path}?${uri.query}' : uri.path;
      }
    }
    out.sort((a, b) => a.fullName.compareTo(b.fullName));
    return out;
  }

  /// All school classes. Same pagination handling as teachers().
  Future<List<SchoolClass>> schoolClasses() async {
    final out = <SchoolClass>[];
    String? path = '/api/classes/';
    while (path != null) {
      final res = await _client.request(() => _client.raw.get(path!));
      final results = (res.data['results'] as List<dynamic>?) ?? const [];
      out.addAll(
        results.cast<Map<String, dynamic>>().map(SchoolClass.fromJson),
      );
      final next = res.data['next'] as String?;
      if (next == null || next.isEmpty) {
        path = null;
      } else {
        final uri = Uri.parse(next);
        path = uri.hasQuery ? '${uri.path}?${uri.query}' : uri.path;
      }
    }
    // Sort by grade then by number — matches the order admins read on paper.
    out.sort((a, b) {
      final g = a.gradeName.compareTo(b.gradeName);
      if (g != 0) return g;
      return a.number.compareTo(b.number);
    });
    return out;
  }
}
