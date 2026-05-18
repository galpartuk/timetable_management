import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../i18n/tr.dart';
import '../admin/admin_screen.dart';
import '../settings/settings_screen.dart';
import '../timetable/week_view_screen.dart';
import '../today/today_screen.dart';

/// Bottom-tab shell. Admin tab appears only for admins.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final isAdmin = auth is AuthAuthed && auth.user.isAdmin;

    final pages = <Widget>[
      const TodayScreen(),
      const WeekViewScreen(),
      if (isAdmin) const AdminScreen(),
      const SettingsScreen(),
    ];
    final destinations = <NavigationDestination>[
      NavigationDestination(
        icon: const Icon(Icons.today_outlined),
        selectedIcon: const Icon(Icons.today),
        label: tr(context, 'היום'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.calendar_view_week_outlined),
        selectedIcon: const Icon(Icons.calendar_view_week),
        label: tr(context, 'השבוע'),
      ),
      if (isAdmin)
        NavigationDestination(
          icon: const Icon(Icons.admin_panel_settings_outlined),
          selectedIcon: const Icon(Icons.admin_panel_settings),
          label: tr(context, 'ניהול'),
        ),
      NavigationDestination(
        icon: const Icon(Icons.settings_outlined),
        selectedIcon: const Icon(Icons.settings),
        label: tr(context, 'הגדרות'),
      ),
    ];

    final selected = _index.clamp(0, pages.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Text(_titleForIndex(context, selected, isAdmin)),
        centerTitle: false,
      ),
      body: pages[selected],
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: destinations,
      ),
    );
  }

  String _titleForIndex(BuildContext context, int i, bool isAdmin) {
    final labels = isAdmin
        ? ['היום', 'השבוע', 'ניהול', 'הגדרות']
        : ['היום', 'השבוע', 'הגדרות'];
    return tr(context, labels[i.clamp(0, labels.length - 1)]);
  }
}
