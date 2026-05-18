import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../api/timetable_api.dart';
import '../auth/auth_provider.dart';
import '../core/failure.dart';
import '../models/timetable.dart';
import '../models/timetable_entry.dart';

/// What screens consume: cached + fresh data, with a stale flag.
class TimetableData {
  TimetableData({
    required this.entries,
    required this.stale,
    required this.lastUpdated,
  });
  final List<TimetableEntry> entries;
  final bool stale;
  final DateTime? lastUpdated;
}

final timetableApiProvider = Provider<TimetableApi>((ref) {
  return TimetableApi(ref.read(dioClientProvider));
});

final referenceApiProvider = Provider<ReferenceApi>((ref) {
  return ReferenceApi(ref.read(dioClientProvider));
});

final timetableRepositoryProvider = Provider<TimetableRepository>((ref) {
  return TimetableRepository(
    ref.read(timetableApiProvider),
  );
});

/// List of all timetables (admin uses this; teachers see the latest).
final timetablesListProvider = FutureProvider<List<Timetable>>((ref) async {
  return ref.read(timetableApiProvider).list();
});

/// The "active" timetable — the latest completed one. Falls back to the
/// first in the list. The mobile app treats this as "the schedule
/// to show".
final activeTimetableProvider = FutureProvider<Timetable?>((ref) async {
  final list = await ref.watch(timetablesListProvider.future);
  if (list.isEmpty) return null;
  return list.firstWhere(
    (t) => t.status == 'completed',
    orElse: () => list.first,
  );
});

/// Family provider: schedule for the given teacher or class.
/// Pass either teacherId or schoolClassId (one must be non-null).
final scheduleForOwnerProvider = StreamProvider.family<TimetableData, ScheduleOwner>(
  (ref, owner) async* {
    final repo = ref.read(timetableRepositoryProvider);
    final tt = await ref.watch(activeTimetableProvider.future);
    if (tt == null) {
      yield TimetableData(entries: const [], stale: false, lastUpdated: null);
      return;
    }
    yield* repo.scheduleStream(timetableId: tt.id, owner: owner);
  },
);

class ScheduleOwner {
  const ScheduleOwner({this.teacherId, this.classId})
      : assert(teacherId != null || classId != null,
            'pass either teacherId or classId');
  final int? teacherId;
  final int? classId;

  String get cacheKey =>
      teacherId != null ? 't$teacherId' : 'c$classId';

  @override
  bool operator ==(Object other) =>
      other is ScheduleOwner &&
      other.teacherId == teacherId &&
      other.classId == classId;

  @override
  int get hashCode => Object.hash(teacherId, classId);
}

class TimetableRepository {
  TimetableRepository(this._api);
  final TimetableApi _api;

  /// Stream that emits cached data immediately, then revalidates from
  /// network. On network failure with cache hit, emits cached + stale.
  Stream<TimetableData> scheduleStream({
    required int timetableId,
    required ScheduleOwner owner,
  }) async* {
    final box = await _box();
    final key = _key(timetableId, owner);
    final cached = _readCache(box, key);
    if (cached != null) {
      yield TimetableData(
        entries: cached.entries,
        stale: false,
        lastUpdated: cached.lastUpdated,
      );
    }
    try {
      final fresh = owner.teacherId != null
          ? await _api.byTeacher(timetableId, owner.teacherId!)
          : await _api.byClass(timetableId, owner.classId!);
      final now = DateTime.now();
      await _writeCache(box, key, fresh, now);
      yield TimetableData(entries: fresh, stale: false, lastUpdated: now);
    } on Failure catch (f) {
      if (cached != null && f.isNetwork) {
        // We already yielded the cache above; emit again with the stale flag.
        yield TimetableData(
          entries: cached.entries,
          stale: true,
          lastUpdated: cached.lastUpdated,
        );
      } else {
        rethrow;
      }
    }
  }

  Future<Box<String>> _box() async {
    if (!Hive.isBoxOpen('schedule_cache')) {
      await Hive.openBox<String>('schedule_cache');
    }
    return Hive.box<String>('schedule_cache');
  }

  String _key(int timetableId, ScheduleOwner owner) =>
      'schedule_${timetableId}_${owner.cacheKey}';

  _CachedSchedule? _readCache(Box<String> box, String key) {
    final raw = box.get(key);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final entries = (map['entries'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(TimetableEntry.fromJson)
          .toList();
      final updated = DateTime.tryParse(map['updated'] as String? ?? '');
      return _CachedSchedule(entries: entries, lastUpdated: updated);
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeCache(
    Box<String> box,
    String key,
    List<TimetableEntry> entries,
    DateTime updated,
  ) async {
    final payload = jsonEncode({
      'entries': entries.map((e) => e.toJson()).toList(),
      'updated': updated.toIso8601String(),
    });
    await box.put(key, payload);
  }
}

class _CachedSchedule {
  _CachedSchedule({required this.entries, this.lastUpdated});
  final List<TimetableEntry> entries;
  final DateTime? lastUpdated;
}
