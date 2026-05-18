import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_provider.dart';
import '../auth/auth_state.dart';
import '../i18n/tr.dart';
import '../repositories/timetable_repository.dart';
import '../state/view_as.dart';

/// Header chip shown on Today / Weekly views for admins. Tap to open a
/// bottom-sheet picker that lets the admin override the schedule owner
/// with any teacher or class in the school. Non-admins don't see this.
class ViewAsChip extends ConsumerWidget {
  const ViewAsChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthAuthed || !auth.user.isAdmin) {
      return const SizedBox.shrink();
    }
    final view = ref.watch(viewAsProvider);
    final label = view == null
        ? tr(context, 'אני')
        : (view.isTeacher
            ? trf(context, 'מורה: {0}', [view.displayName])
            : trf(context, 'כיתה: {0}', [view.displayName]));

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Material(
        color: const Color(0xFFEFF3FF),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _openPicker(context, ref),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                const Icon(Icons.visibility_outlined, size: 18, color: Color(0xFF4338CA)),
                const SizedBox(width: 8),
                Text(
                  tr(context, 'צופה בתור: '),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: Color(0xFF4338CA),
                  ),
                ),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: Color(0xFF1E1B4B),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (view != null)
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    tooltip: tr(context, 'איפוס'),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () =>
                        ref.read(viewAsProvider.notifier).state = null,
                  )
                else
                  const Icon(Icons.unfold_more, size: 18, color: Color(0xFF4338CA)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openPicker(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ViewAsPickerSheet(),
    );
  }
}

class _ViewAsPickerSheet extends ConsumerStatefulWidget {
  const _ViewAsPickerSheet();

  @override
  ConsumerState<_ViewAsPickerSheet> createState() => _ViewAsPickerSheetState();
}

class _ViewAsPickerSheetState extends ConsumerState<_ViewAsPickerSheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  String _query = '';

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final teachers = ref.watch(teachersListProvider);
    final classes = ref.watch(classesListProvider);

    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: 0.85,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade400,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              tr(context, 'צפייה בתור'),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 8),
            TabBar(
              controller: _tab,
              tabs: [
                Tab(text: tr(context, 'מורים')),
                Tab(text: tr(context, 'כיתות')),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: TextField(
                decoration: InputDecoration(
                  hintText: tr(context, 'חיפוש'),
                  prefixIcon: const Icon(Icons.search),
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () {
                    ref.read(viewAsProvider.notifier).state = null;
                    Navigator.of(context).pop();
                  },
                  icon: const Icon(Icons.person_outline),
                  label: Text(tr(context, 'חזרה לתצוגת עצמי')),
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tab,
                children: [
                  _buildTeacherList(teachers),
                  _buildClassList(classes),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeacherList(AsyncValue<dynamic> teachers) {
    return teachers.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('${tr(context, 'שגיאה')}: $e')),
      data: (list) {
        final q = _query.toLowerCase();
        final filtered = (list as List)
            .where((t) =>
                q.isEmpty || (t.fullName as String).toLowerCase().contains(q))
            .toList();
        if (filtered.isEmpty) {
          return Center(child: Text(tr(context, 'לא נמצאו מורים')));
        }
        return ListView.builder(
          itemCount: filtered.length,
          itemBuilder: (_, i) {
            final t = filtered[i];
            return ListTile(
              title: Text(t.fullName as String),
              onTap: () {
                ref.read(viewAsProvider.notifier).state =
                    ViewAs.teacher(id: t.id as int, name: t.fullName as String);
                Navigator.of(context).pop();
              },
            );
          },
        );
      },
    );
  }

  Widget _buildClassList(AsyncValue<dynamic> classes) {
    return classes.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('${tr(context, 'שגיאה')}: $e')),
      data: (list) {
        final q = _query.toLowerCase();
        final filtered = (list as List)
            .where((c) =>
                q.isEmpty ||
                (c.displayName as String).toLowerCase().contains(q) ||
                (c.gradeName as String).toLowerCase().contains(q))
            .toList();
        if (filtered.isEmpty) {
          return Center(child: Text(tr(context, 'לא נמצאו כיתות')));
        }
        return ListView.builder(
          itemCount: filtered.length,
          itemBuilder: (_, i) {
            final c = filtered[i];
            return ListTile(
              title: Text(c.displayName as String),
              subtitle: c.studentCount != null
                  ? Text(trf(context, '{0} תלמידים', [c.studentCount]))
                  : null,
              onTap: () {
                ref.read(viewAsProvider.notifier).state = ViewAs.classroom(
                    id: c.id as int, name: c.displayName as String);
                Navigator.of(context).pop();
              },
            );
          },
        );
      },
    );
  }
}
