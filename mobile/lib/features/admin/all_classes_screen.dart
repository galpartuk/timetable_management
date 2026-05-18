import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/tr.dart';
import '../../repositories/timetable_repository.dart';
import '../../widgets/empty_state.dart';
import '../timetable/class_week_screen.dart';

/// Admin-only list of all classes. Tap a row to see that class's week.
class AllClassesScreen extends ConsumerStatefulWidget {
  const AllClassesScreen({super.key});

  @override
  ConsumerState<AllClassesScreen> createState() => _AllClassesScreenState();
}

class _AllClassesScreenState extends ConsumerState<AllClassesScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final classes = ref.watch(classesListProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'כל הכיתות'))),
      body: classes.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.error_outline,
          title: tr(context, 'שגיאה'),
          subtitle: '$e',
        ),
        data: (list) {
          final q = _query.toLowerCase();
          final filtered = q.isEmpty
              ? list
              : list
                  .where((c) =>
                      c.displayName.toLowerCase().contains(q) ||
                      c.gradeName.toLowerCase().contains(q))
                  .toList();
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: tr(context, 'חיפוש כיתה'),
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
                        icon: Icons.class_outlined,
                        title: tr(context, 'לא נמצאו כיתות'),
                      )
                    : RefreshIndicator(
                        onRefresh: () async =>
                            ref.invalidate(classesListProvider),
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(8, 4, 8, 16),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 4),
                          itemBuilder: (_, i) {
                            final c = filtered[i];
                            return Card(
                              margin: EdgeInsets.zero,
                              child: ListTile(
                                title: Text(
                                  c.displayName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: c.studentCount != null
                                    ? Text(trf(context, '{0} תלמידים', [c.studentCount]))
                                    : null,
                                trailing: const Icon(Icons.chevron_left),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => ClassWeekScreen(
                                        classId: c.id,
                                        className: c.displayName,
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
