import '../core/dio_client.dart';
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
}
