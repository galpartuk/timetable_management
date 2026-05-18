import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// App theme. Material 3 + Heebo font (ships with Hebrew glyphs).
/// Light theme for v1; dark theme follows in v2.
class AppTheme {
  static ThemeData light() {
    final base = ColorScheme.fromSeed(
      seedColor: const Color(0xFF4F46E5), // indigo — matches the web app
      brightness: Brightness.light,
    );
    final textTheme = GoogleFonts.heeboTextTheme();
    return ThemeData(
      useMaterial3: true,
      colorScheme: base,
      textTheme: textTheme,
      scaffoldBackgroundColor: const Color(0xFFF8F9FB),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF14181F),
        elevation: 0,
        scrolledUnderElevation: 1,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: const Color(0xFF14181F),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0x14141821)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF1F3F7),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}
