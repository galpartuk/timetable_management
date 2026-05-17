import io
from collections import Counter

from django.db import transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.school.models import School
from apps.scheduling.models import Timetable, TimetableEntry
from apps.subjects.models import Subject, Teacher, TeachingAssignment

from .exporter import SHEET_BUILDERS, SUPER_ADMIN_ONLY_SHEETS, build_workbook
from .models import ImportLog
from .parser import analyze, apply as apply_parsed, parse_timetable_excel
from .parser_days_off import parse_days_off_excel


def _is_super_admin(user) -> bool:
    return getattr(getattr(user, 'profile', None), 'role', None) == 'super_admin'


def _summarize_parsed(parsed) -> dict:
    """Build a digest shown in the dry-run preview screen."""
    subjects = Counter(r.subject for r in parsed.assignment_rows)
    teachers = Counter()
    class_grade = Counter()
    rows_with_teacher = 0
    rows_with_hours = 0
    pool_rows = 0
    inactive_rows = 0
    for r in parsed.assignment_rows:
        if r.teacher:
            teachers[r.teacher] += 1
            rows_with_teacher += 1
        if r.weekly_hours:
            rows_with_hours += 1
        if len(r.classes) > 1:
            pool_rows += 1
        if not r.is_active:
            inactive_rows += 1
        for g, n in r.classes:
            class_grade[g] += 1

    role_teachers = Counter(r.teacher for r in parsed.role_rows if r.teacher)

    return {
        'sheets_seen': parsed.sheets_seen,
        'assignment_rows_total': len(parsed.assignment_rows),
        'role_rows_total': len(parsed.role_rows),
        'subjects_distinct': len(subjects),
        'teachers_distinct': len(teachers | role_teachers),
        'rows_with_teacher': rows_with_teacher,
        'rows_with_hours': rows_with_hours,
        'pool_rows': pool_rows,
        'inactive_rows': inactive_rows,
        'class_rows_per_grade': dict(class_grade),
        'top_subjects': subjects.most_common(15),
        'top_teachers': teachers.most_common(15),
        'warnings': parsed.warnings,
        'errors': parsed.errors,
    }


@api_view(['POST'])
@parser_classes([MultiPartParser])
def upload_excel(request):
    """Parse + commit. If ``dry_run=true``, only the preview is built and
    the row is stored with status=PREVIEW for the FE to confirm later.

    Body (multipart):
      file: the .xlsx
      school_id: int
      dry_run: 'true' / 'false' (default false)
      wipe_existing: 'true' / 'false' (default false) — clears all teaching
        data for the school before importing. Use sparingly.
    """
    file = request.FILES.get('file')
    school_id = request.data.get('school_id')
    dry_run = (request.data.get('dry_run') or '').lower() == 'true'
    wipe = (request.data.get('wipe_existing') or '').lower() == 'true'

    if not file:
        return Response({'error': 'לא נבחר קובץ'}, status=status.HTTP_400_BAD_REQUEST)
    if not school_id:
        return Response({'error': 'לא נבחר בית ספר'}, status=status.HTTP_400_BAD_REQUEST)
    school = School.objects.filter(id=school_id).first()
    if not school:
        return Response({'error': f'בית ספר {school_id} לא נמצא'}, status=status.HTTP_404_NOT_FOUND)

    import_log = ImportLog.objects.create(
        school=school,
        file_name=file.name,
        status=ImportLog.Status.PROCESSING,
        is_dry_run=dry_run,
    )

    try:
        # Phase 1: analyze (no DB writes).
        parsed = analyze(file, file_name=file.name)
        preview = _summarize_parsed(parsed)
        import_log.preview_data = preview
        import_log.warnings = parsed.warnings
        import_log.errors = parsed.errors

        if dry_run:
            import_log.status = ImportLog.Status.PREVIEW
            import_log.save()
            return Response({
                'message': 'תצוגה מקדימה הוכנה — אישור נדרש לייבוא בפועל',
                'log_id': import_log.id,
                'preview': preview,
                'dry_run': True,
            })

        # Phase 2: commit.
        result = apply_parsed(parsed, school, wipe_existing=wipe)
        import_log.subjects_imported = result.subjects_created
        import_log.teachers_imported = result.teachers_created
        import_log.classes_imported = result.classes_created
        import_log.assignments_imported = result.assignments_created + result.assignments_updated
        import_log.roles_imported = result.roles_created
        import_log.warnings = result.warnings
        import_log.errors = result.errors
        import_log.details = {
            'assignments_created': result.assignments_created,
            'assignments_updated': result.assignments_updated,
            'sheets_seen': parsed.sheets_seen,
        }
        import_log.status = ImportLog.Status.COMPLETED
        import_log.save()
        return Response({
            'message': 'הייבוא הושלם בהצלחה',
            'log_id': import_log.id,
            'subjects_imported': import_log.subjects_imported,
            'teachers_imported': import_log.teachers_imported,
            'classes_imported': import_log.classes_imported,
            'assignments_imported': import_log.assignments_imported,
            'roles_imported': import_log.roles_imported,
            'warnings': import_log.warnings,
            'errors': import_log.errors,
            'preview': preview,
        })
    except Exception as e:
        import_log.status = ImportLog.Status.FAILED
        import_log.errors = [str(e)]
        import_log.save()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@parser_classes([MultiPartParser])
def upload_days_off(request):
    file = request.FILES.get('file')
    school_id = request.data.get('school_id')

    if not file:
        return Response({'error': 'לא נבחר קובץ'}, status=status.HTTP_400_BAD_REQUEST)
    if not school_id:
        return Response({'error': 'לא נבחר בית ספר'}, status=status.HTTP_400_BAD_REQUEST)

    school = School.objects.get(id=school_id)
    import_log = ImportLog.objects.create(
        school=school,
        file_name=file.name,
        status=ImportLog.Status.PROCESSING,
    )

    try:
        result = parse_days_off_excel(file, school, import_log)
        import_log.status = ImportLog.Status.COMPLETED
        import_log.save()
        return Response({
            'message': 'הייבוא הושלם בהצלחה',
            'teachers_updated': result['teachers_updated'],
            'errors': result['errors'],
        })
    except Exception as e:
        import_log.status = ImportLog.Status.FAILED
        import_log.errors = [str(e)]
        import_log.save()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def import_logs(request):
    school_id = request.query_params.get('school_id')
    logs = ImportLog.objects.filter(school_id=school_id) if school_id else ImportLog.objects.all()
    data = [{
        'id': log.id,
        'file_name': log.file_name,
        'status': log.status,
        'is_dry_run': log.is_dry_run,
        'uploaded_at': log.uploaded_at,
        'subjects_imported': log.subjects_imported,
        'teachers_imported': log.teachers_imported,
        'classes_imported': log.classes_imported,
        'assignments_imported': log.assignments_imported,
        'roles_imported': log.roles_imported,
        'warnings': log.warnings,
        'errors': log.errors,
    } for log in logs[:20]]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gap_analysis(request):
    """Snapshot of "what's missing for a feasible timetable".

    Returns counts and lists of:
      • classes with no homeroom teacher
      • subject deliveries with no teacher (TBD)
      • subject deliveries with no hours
      • teacher hour load vs their cap
      • teacher hours that overlap their role's must_teach floor

    The FE shows this on the Manage page so the school can fix the gaps
    before running the solver.
    """
    from apps.school.models import SchoolClass
    from apps.subjects.models import Teacher, TeacherRole
    from django.db.models import Sum, Count

    school_id = int(request.query_params.get('school_id') or 1)

    classes_missing_homeroom = list(
        SchoolClass.objects.filter(
            grade__school_id=school_id, homeroom_teacher__isnull=True,
        ).select_related('grade').values('id', 'grade__name', 'number')
    )

    assignments_without_teacher = list(
        TeachingAssignment.objects.filter(
            subject__school_id=school_id, teacher__isnull=True, is_active=True,
        ).select_related('subject', 'school_class__grade').values(
            'id', 'subject__name_he', 'school_class__grade__name',
            'school_class__number', 'weekly_hours', 'track_label',
        )[:200]
    )

    assignments_without_hours = list(
        TeachingAssignment.objects.filter(
            subject__school_id=school_id, weekly_hours=0,
        ).values('id', 'subject__name_he', 'school_class__grade__name',
                 'school_class__number')[:200]
    )

    from django.db.models import Q
    teacher_loads = []
    # Only active assignments count toward the load — inactive ones are
    # "פתיחה מותנית" (conditional) and shouldn't pressure the cap.
    for t in Teacher.objects.filter(school_id=school_id).annotate(
        load=Sum('assignments__weekly_hours', filter=Q(assignments__is_active=True)),
        role_hours=Sum('roles__weekly_hours'),
        must_teach=Sum('roles__must_teach_hours'),
    ).order_by('-load'):
        teacher_loads.append({
            'id': t.id,
            'name': str(t),
            'assigned_hours': float(t.load or 0),
            'role_hours': float(t.role_hours or 0),
            'must_teach': float(t.must_teach or 0),
            'cap': t.max_weekly_hours,
            'over_cap': (float(t.load or 0) > t.max_weekly_hours),
            'under_must_teach': (
                float(t.must_teach or 0) > 0
                and float(t.load or 0) < float(t.must_teach or 0)
            ),
        })

    return Response({
        'school_id': school_id,
        'classes_missing_homeroom': classes_missing_homeroom,
        'classes_missing_homeroom_count': len(classes_missing_homeroom),
        'assignments_without_teacher': assignments_without_teacher,
        'assignments_without_teacher_count': len(assignments_without_teacher),
        'assignments_without_hours': assignments_without_hours,
        'assignments_without_hours_count': len(assignments_without_hours),
        'teacher_loads': teacher_loads,
    })


# ─────────────────────────────────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_export_options(request):
    """Tells the FE which sheets are available + which require super-admin.
    Used to render the checkbox grid."""
    is_sa = _is_super_admin(request.user)
    return Response({
        'sheets': sorted(SHEET_BUILDERS.keys()),
        'super_admin_only': sorted(SUPER_ADMIN_ONLY_SHEETS),
        'is_super_admin': is_sa,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_excel(request):
    """Build a multi-sheet xlsx based on the spec and stream it back.

    Body: {school_id?, timetable_id?, sheets: [..]}
    Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    """
    spec = request.data or {}
    sheets = spec.get('sheets') or []
    if not isinstance(sheets, list) or not sheets:
        return Response({'error': 'sheets must be a non-empty list'},
                        status=status.HTTP_400_BAD_REQUEST)

    is_sa = _is_super_admin(request.user)
    # Strip super-admin-only sheets early so non-admins get a friendlier error
    # before we even start building the workbook.
    forbidden = [s for s in sheets if s in SUPER_ADMIN_ONLY_SHEETS and not is_sa]
    if forbidden:
        return Response(
            {'error': f'super_admin required for: {", ".join(forbidden)}'},
            status=status.HTTP_403_FORBIDDEN,
        )

    wb = build_workbook(spec, is_super_admin=is_sa)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    timetable_id = spec.get('timetable_id')
    filename = f'timetable_export_{timetable_id or "all"}.xlsx'
    response = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ─────────────────────────────────────────────────────────────────────────
# BULK DELETE
# ─────────────────────────────────────────────────────────────────────────
# Each operation is its own endpoint so they can be permission-checked
# individually and the FE shows a clear "this will delete X" preview.

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_timetable(request, timetable_id: int):
    """Delete a single timetable. Cascades to its entries via the FK."""
    tt = Timetable.objects.filter(id=timetable_id).first()
    if not tt:
        return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)
    name = tt.name
    entry_count = TimetableEntry.objects.filter(timetable=tt).count()
    tt.delete()
    return Response({'ok': True, 'deleted': name, 'entries_deleted': entry_count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_timetable_entries(request, timetable_id: int):
    """Wipe every TimetableEntry on a timetable but keep the timetable
    record (so the user can re-run the generator on it)."""
    tt = Timetable.objects.filter(id=timetable_id).first()
    if not tt:
        return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)
    deleted, _ = TimetableEntry.objects.filter(timetable=tt).delete()
    tt.status = Timetable.Status.DRAFT
    tt.save(update_fields=['status'])
    return Response({'ok': True, 'entries_deleted': deleted})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bulk_delete(request):
    """Multi-purpose destructive operations. Body: {operation, school_id?}.

    Operations:
      - clear_assignments      remove all TeachingAssignments for school
      - clear_all_timetables   remove every Timetable for school (cascades)
      - clear_subjects         remove all Subjects (only if not referenced)
      - clear_teachers         remove all Teachers (only if not referenced)
      - wipe_school_data       super-admin only — nukes timetables,
                               assignments, constraints, entries. Keeps
                               teachers, subjects, classes, time slots.
    """
    op = (request.data or {}).get('operation')
    school_id = (request.data or {}).get('school_id') or 1
    if not School.objects.filter(id=school_id).exists():
        return Response({'error': f'school {school_id} not found'},
                        status=status.HTTP_404_NOT_FOUND)

    is_sa = _is_super_admin(request.user)
    summary: dict = {}

    if op == 'clear_assignments':
        n, _ = TeachingAssignment.objects.filter(school_class__grade__school_id=school_id).delete()
        summary['assignments_deleted'] = n

    elif op == 'clear_all_timetables':
        # Cascade handles entries.
        with transaction.atomic():
            entries = TimetableEntry.objects.filter(timetable__school_id=school_id).count()
            tts, _ = Timetable.objects.filter(school_id=school_id).delete()
            summary['timetables_deleted'] = tts
            summary['entries_deleted'] = entries

    elif op == 'clear_subjects':
        # Refuse if any subject is referenced by an assignment or entry —
        # that would silently nuke history. Make the user clear those first.
        if (
            TeachingAssignment.objects.filter(subject__school_id=school_id).exists()
            or TimetableEntry.objects.filter(subject__school_id=school_id).exists()
        ):
            return Response({
                'error': 'subjects are referenced by assignments or timetable entries; '
                         'clear those first',
            }, status=status.HTTP_409_CONFLICT)
        n, _ = Subject.objects.filter(school_id=school_id).delete()
        summary['subjects_deleted'] = n

    elif op == 'clear_teachers':
        if (
            TeachingAssignment.objects.filter(teacher__school_id=school_id).exists()
            or TimetableEntry.objects.filter(teacher__school_id=school_id).exists()
        ):
            return Response({
                'error': 'teachers are referenced by assignments or timetable entries; '
                         'clear those first',
            }, status=status.HTTP_409_CONFLICT)
        n, _ = Teacher.objects.filter(school_id=school_id).delete()
        summary['teachers_deleted'] = n

    elif op == 'wipe_school_data':
        if not is_sa:
            return Response({'error': 'super_admin required'},
                            status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            from apps.scheduling.models import Constraint
            entries = TimetableEntry.objects.filter(timetable__school_id=school_id).count()
            tts = Timetable.objects.filter(school_id=school_id).count()
            asn = TeachingAssignment.objects.filter(school_class__grade__school_id=school_id).count()
            cons = Constraint.objects.filter(school_id=school_id).count()
            Timetable.objects.filter(school_id=school_id).delete()  # cascades entries
            TeachingAssignment.objects.filter(school_class__grade__school_id=school_id).delete()
            Constraint.objects.filter(school_id=school_id).delete()
            summary = {
                'timetables_deleted': tts,
                'entries_deleted': entries,
                'assignments_deleted': asn,
                'constraints_deleted': cons,
            }

    else:
        return Response({'error': f'unknown operation {op!r}'},
                        status=status.HTTP_400_BAD_REQUEST)

    return Response({'ok': True, 'operation': op, 'summary': summary})
