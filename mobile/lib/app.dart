import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'features/settings/locale_provider.dart';
import 'routing/router.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final selected = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'מערכת שעות',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: selected,
      supportedLocales: const [Locale('he'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
      builder: (context, child) {
        // Hebrew → RTL, English → LTR. Material's automatic direction
        // also follows locale, but we set it explicitly here to be
        // resilient to any nested widget that overrides Directionality.
        return Directionality(
          textDirection: selected.languageCode == 'en'
              ? TextDirection.ltr
              : TextDirection.rtl,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
