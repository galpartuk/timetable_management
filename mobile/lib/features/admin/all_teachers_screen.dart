import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../timetable/teacher_week_screen.dart';

/// Admin-only list of all teachers. Tap a row to see that teacher's week.
class AllTeachersScreen extends ConsumerStatefulWidget {
  const AllTeachersScreen({super.key});

  @override
  ConsumerState<AllTeachersScreen> createState() => _AllTeachersScreenState();
}

class _AllTeachersScreenState extends ConsumerState<AllTeachersScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final teachers = ref.watch(teachersListProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'כל המורים'))),
      body: teachers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline,
          title: tr(context, 'שגיאה'),
          subtitle: '$e',
        ),
        data: (list) {
          final filtered = _query.isEmpty
              ? list
              : list
                  .where((t) =>
                      t.fullName.toLowerCase().contains(_query.toLowerCase()))
                  .toList();
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: tr(context, 'חיפוש מורה'),
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? EmptyState(
                        icon: Icons.person_off_outlined,
                        title: tr(context, 'לא נמצאו מורים'),
                      )
                    : RefreshIndicator(
                        onRefresh: () async =>
                            ref.invalidate(teachersListProvider),
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(8, 4, 8, 16),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 4),
                          itemBuilder: (_, i) {
                            final t = filtered[i];
                            return Card(
                              margin: EdgeInsets.zero,
                              child: ListTile(
                                title: Text(
                                  t.fullName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                trailing: const Icon(Icons.chevron_left),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => TeacherWeekScreen(
                                        teacherId: t.id,
                                        teacherName: t.fullName,
                                      ),
                                    ),
                                  );
                                },
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
