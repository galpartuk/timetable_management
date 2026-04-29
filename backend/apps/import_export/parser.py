"""
Excel parser for the school timetable format.

Each sheet = one subject. Common column structure:
- Column A: Class (כיתה) - e.g., ז1, ח2
- Column B: Class type / Teacher name (סוג כיתה / שם מורה)
- Column C: Teacher name (שם המורה המלמד)
- Column D: Weekly hours (שעות הוראה)
- Column G: Notes (הערות)

Classes are grouped by grade: ז (7), ח (8), ט (9), י (10), יא (11), יב (12)
"""
import re
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook
from django.db.models import Sum

from apps.school.models import School, Grade, SchoolClass
from apps.subjects.models import Subject, Teacher, TeachingAssignment

# Hebrew grade letters to numeric levels
GRADE_MAP = {
    'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'יא': 11, 'יב': 12,
}

# Sheets that don't follow the standard subject format
SKIP_SHEETS = {'תפקידים', 'השכלה'}

# Class type mapping
CLASS_TYPE_MAP = {
    'חינוך מיוחד': SchoolClass.ClassType.SPECIAL_ED,
    'מנהיגות': SchoolClass.ClassType.LEADERSHIP,
}


def parse_class_name(cell_value):
    """Parse class name like 'ז1', 'יא3' into (grade_letter, number)."""
    if not cell_value or not isinstance(cell_value, str):
        return None, None
    cell_value = cell_value.strip()
    # Match Hebrew grade prefix + digit(s)
    match = re.match(r'^(יב|יא|י|ט|ח|ז)(\d+)\s*$', cell_value)
    if match:
        return match.group(1), int(match.group(2))
    return None, None


def parse_hours(value):
    """Parse hours value which might be a number, string like '3+1', etc."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        value = value.strip()
        # Handle "3+1" format - take the first number as teaching hours
        match = re.match(r'^(\d+(?:\.\d+)?)', value)
        if match:
            return Decimal(match.group(1))
    return None


def find_header_row(ws):
    """Find the row containing 'כיתה' header."""
    for row in ws.iter_rows(min_row=1, max_row=10, max_col=10):
        for cell in row:
            if cell.value and isinstance(cell.value, str) and 'כיתה' == cell.value.strip():
                return cell.row, cell.column
    return None, None


def get_subject_name(ws):
    """Extract subject name from the sheet (usually in row 1)."""
    for row in ws.iter_rows(min_row=1, max_row=2, max_col=10):
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                name = cell.value.strip()
                if name and len(name) > 1 and name != 'כיתה':
                    return name
    return ws.title


def detect_column_mapping(ws, header_row):
    """Detect which columns contain which data based on header text."""
    mapping = {}
    for cell in ws[header_row]:
        if cell.value and isinstance(cell.value, str):
            val = cell.value.strip()
            col = cell.column
            if val == 'כיתה':
                mapping['class'] = col
            elif 'סוג כיתה' in val:
                mapping['class_type'] = col
            elif 'שם המורה' in val or 'שם מורה' in val:
                mapping['teacher'] = col
            elif val == 'שעות הוראה' or val == 'שעות':
                mapping['hours'] = col
            elif 'גמול בגרות' in val:
                mapping['bagrut_hours'] = col
            elif 'סמל שאלון' in val:
                mapping['bagrut_code'] = col
            elif val == 'הערות':
                mapping['notes'] = col
            elif "מס' תלמידים" in val:
                mapping['student_count'] = col
    return mapping


def parse_timetable_excel(file, school_id, import_log):
    """Parse the uploaded Excel file and import data into the database."""
    school = School.objects.get(id=school_id)
    wb = load_workbook(file, data_only=True)

    subjects_created = set()
    teachers_created = set()
    assignments_created = 0
    errors = []

    # Ensure grades exist
    grades = {}
    for letter, level in GRADE_MAP.items():
        grade, _ = Grade.objects.get_or_create(
            school=school, level=level,
            defaults={'name': letter, 'order': level},
        )
        grades[letter] = grade

    for sheet_name in wb.sheetnames:
        if sheet_name in SKIP_SHEETS:
            continue

        ws = wb[sheet_name]
        subject_name = get_subject_name(ws)

        if not subject_name:
            errors.append(f'לא נמצא שם מקצוע בגיליון: {sheet_name}')
            continue

        # Create or get subject
        subject, created = Subject.objects.get_or_create(
            school=school, name_he=subject_name,
        )
        if created:
            subjects_created.add(subject_name)

        # Find header and column mapping - skip sheets with non-standard format
        header_row, _ = find_header_row(ws)
        if header_row is None:
            continue

        col_map = detect_column_mapping(ws, header_row)
        if 'class' not in col_map:
            errors.append(f'לא נמצאה עמודת כיתה בגיליון: {sheet_name}')
            continue

        # Parse data rows
        for row in ws.iter_rows(min_row=header_row + 1, max_row=ws.max_row):
            class_cell = row[col_map['class'] - 1].value
            grade_letter, class_num = parse_class_name(str(class_cell) if class_cell else '')

            if grade_letter is None or grade_letter not in grades:
                continue

            grade = grades[grade_letter]

            # Get or create class
            class_type = SchoolClass.ClassType.REGULAR
            if 'class_type' in col_map:
                type_val = row[col_map['class_type'] - 1].value
                if type_val and isinstance(type_val, str):
                    class_type = CLASS_TYPE_MAP.get(type_val.strip(), SchoolClass.ClassType.REGULAR)

            school_class, _ = SchoolClass.objects.get_or_create(
                grade=grade, number=class_num,
                defaults={'class_type': class_type},
            )

            # Get teacher name
            teacher_name = None
            if 'teacher' in col_map:
                teacher_name = row[col_map['teacher'] - 1].value
            if not teacher_name and 'class_type' in col_map:
                # Sometimes teacher is in the class_type column (when no class_type column)
                pass

            # Get hours
            hours = None
            if 'hours' in col_map:
                hours = parse_hours(row[col_map['hours'] - 1].value)

            if not teacher_name or not hours:
                continue

            teacher_name = str(teacher_name).strip()
            if not teacher_name:
                continue

            # Create or get teacher
            teacher, created = Teacher.objects.get_or_create(
                school=school, first_name=teacher_name,
            )
            if created:
                teachers_created.add(teacher_name)

            # Get optional fields
            bagrut_hours = Decimal('0')
            if 'bagrut_hours' in col_map:
                val = parse_hours(row[col_map['bagrut_hours'] - 1].value)
                if val:
                    bagrut_hours = val

            bagrut_code = ''
            if 'bagrut_code' in col_map:
                val = row[col_map['bagrut_code'] - 1].value
                if val:
                    bagrut_code = str(val).strip()

            notes = ''
            if 'notes' in col_map:
                val = row[col_map['notes'] - 1].value
                if val:
                    notes = str(val).strip()

            # Create assignment
            TeachingAssignment.objects.update_or_create(
                subject=subject,
                teacher=teacher,
                school_class=school_class,
                defaults={
                    'weekly_hours': hours,
                    'bagrut_bonus_hours': bagrut_hours,
                    'bagrut_exam_code': bagrut_code,
                    'notes': notes,
                },
            )
            assignments_created += 1

    # Recalculate each teacher's max_weekly_hours from their actual assignments.
    # The Excel doesn't carry a cap, so the sum of assigned hours is the natural value.
    for teacher in Teacher.objects.filter(school=school):
        total = teacher.assignments.aggregate(s=Sum('weekly_hours'))['s'] or Decimal('0')
        teacher.max_weekly_hours = int(total)
        teacher.save(update_fields=['max_weekly_hours'])

    import_log.subjects_imported = len(subjects_created)
    import_log.teachers_imported = len(teachers_created)
    import_log.assignments_imported = assignments_created
    import_log.errors = errors
    import_log.save()

    return {
        'subjects': len(subjects_created),
        'teachers': len(teachers_created),
        'assignments': assignments_created,
        'errors': errors,
    }
