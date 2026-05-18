import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_provider.dart';
import '../../auth/auth_state.dart';
import '../../core/env.dart';
import '../../i18n/tr.dart';
import 'locale_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(authProvider);
    final locale = ref.watch(localeProvider);
    final user = state is AuthAuthed ? state.user : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (user != null) ...[
          _UserCard(),
          const SizedBox(height: 16),
        ],
        _Section(
          title: tr(context, 'שפה'),
          children: [
            RadioListTile<String>(
              title: Text(tr(context, 'עברית')),
              value: 'he',
              groupValue: locale.languageCode,
              onChanged: (v) => ref.read(localeProvider.notifier).state =
                  Locale(v ?? 'he'),
            ),
            RadioListTile<String>(
              title: Text(tr(context, 'English')),
              value: 'en',
              groupValue: locale.languageCode,
              onChanged: (v) => ref.read(localeProvider.notifier).state =
                  Locale(v ?? 'he'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: tr(context, 'אודות'),
          children: [
            ListTile(
              title: Text(tr(context, 'שרת')),
              subtitle: Text(Env.apiBaseUrl),
              leading: const Icon(Icons.cloud_outlined),
            ),
            ListTile(
              title: Text(tr(context, 'גרסה')),
              subtitle: Text(
                Env.buildTimestamp.isEmpty
                    ? Env.appVersion
                    : '${Env.appVersion} · build ${Env.buildTimestamp}',
              ),
              leading: const Icon(Icons.tag_outlined),
            ),
          ],
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.errorContainer,
            foregroundColor: Theme.of(context).colorScheme.onErrorContainer,
          ),
          onPressed: () => ref.read(authProvider.notifier).logout(),
          icon: const Icon(Icons.logout),
          label: Text(tr(context, 'יציאה')),
        ),
      ],
    );
  }
}

class _UserCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(authProvider);
    if (state is! AuthAuthed) return const SizedBox.shrink();
    final user = state.user;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: Theme.of(context).colorScheme.primary,
              child: Text(
                (user.fullName.isNotEmpty ? user.fullName : user.username)
                    .characters
                    .firstOrNull ??
                    '?',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.fullName.isEmpty ? user.username : user.fullName,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  if (user.email.isNotEmpty)
                    Text(
                      user.email,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.outline,
                        fontSize: 13,
                      ),
                    ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    children: [
                      Chip(
                        label: Text(tr(context, _roleLabel(user.role))),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                      ),
                      if (user.profile.teacherName != null)
                        Chip(
                          label: Text(trf(context, 'מורה: {0}', [user.profile.teacherName])),
                          visualDensity: VisualDensity.compact,
                        ),
                      if (user.profile.schoolClassName != null)
                        Chip(
                          label: Text(trf(context, 'כיתה: {0}', [user.profile.schoolClassName])),
                          visualDensity: VisualDensity.compact,
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _roleLabel(String role) => switch (role) {
        'super_admin' => 'מנהל ראשי',
        'admin' => 'מנהל',
        'editor' => 'עורך',
        _ => 'צופה',
      };
  // Hebrew keys above are looked up in tr() at the call site so they
  // translate. Kept as raw strings here to keep the switch a pure func.
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.5,
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ),
        Card(child: Column(children: children)),
      ],
    );
  }
}
