from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.school.models import School

from .models import ImportLog
from .parser import parse_timetable_excel
from .parser_days_off import parse_days_off_excel


@api_view(['POST'])
@parser_classes([MultiPartParser])
def upload_excel(request):
    file = request.FILES.get('file')
    school_id = request.data.get('school_id')

    if not file:
        return Response({'error': 'לא נבחר קובץ'}, status=status.HTTP_400_BAD_REQUEST)
    if not school_id:
        return Response({'error': 'לא נבחר בית ספר'}, status=status.HTTP_400_BAD_REQUEST)

    import_log = ImportLog.objects.create(
        school_id=school_id,
        file_name=file.name,
        status=ImportLog.Status.PROCESSING,
    )

    try:
        result = parse_timetable_excel(file, school_id, import_log)
        import_log.status = ImportLog.Status.COMPLETED
        import_log.save()
        return Response({
            'message': 'הייבוא הושלם בהצלחה',
            'subjects_imported': import_log.subjects_imported,
            'teachers_imported': import_log.teachers_imported,
            'assignments_imported': import_log.assignments_imported,
            'errors': import_log.errors,
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
        'uploaded_at': log.uploaded_at,
        'subjects_imported': log.subjects_imported,
        'teachers_imported': log.teachers_imported,
        'assignments_imported': log.assignments_imported,
        'errors': log.errors,
    } for log in logs[:20]]
    return Response(data)
