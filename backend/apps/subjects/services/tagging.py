"""Auto-categorize teachers into department and coordinator tags.

Two idempotent sync passes, run after every import (from ``apply_parsed``)
and re-runnable on demand:

  • ``sync_department_tags`` — gives each teacher a department tag equal to
    their primary (most-hours) subject. Uses a *fill-if-empty* rule: a teacher
    who already has a department tag is left alone, so a re-import never reverts
    a department the user moved by hand.

  • ``sync_coordinator_tags`` — reads ריכוז/רכז rows from the roles sheet
    (``TeacherRole``), matches the subject, and tags that teacher as the
    coordinator. Re-runnable: it only adds, never strips a coordinator the
    user removed within the same run.

Both only ever touch ``department`` / ``coordinator`` kind tags — ``custom``
tags the user made are never modified.
"""
from __future__ import annotations

from collections import defaultdict

from django.db.models import Sum

from apps.subjects.models import Subject, Teacher, TeacherRole, TeacherTag


# Substrings in a role's title/context that mark it as a subject-coordination
# role. We deliberately match the Hebrew root forms ריכוז / רכז / רכזת.
_COORDINATOR_MARKERS = ('ריכוז', 'רכזת', 'רכז')

# Subjects that are advisory/homeroom rather than an academic discipline. A
# teacher's department should reflect their academic subject, so these are
# never chosen as a primary subject and get no department tag. Extend as
# needed. (חינוך = homeroom.)
_NON_DEPARTMENT_SUBJECTS = {'חינוך'}


def sync_department_tags(school) -> dict[str, int]:
    """Ensure a department tag per subject and assign each teacher to their
    primary subject's department (only when they have no department tag yet).

    Returns a small stats dict for logging/inspection.
    """
    primary = _primary_subject_by_teacher(school)

    tag_cache: dict[int, TeacherTag] = {}

    def _dept_tag_for(subject: Subject) -> TeacherTag:
        if subject.id in tag_cache:
            return tag_cache[subject.id]
        tag, _ = TeacherTag.objects.get_or_create(
            school=school,
            name=subject.name_he,
            defaults={'kind': TeacherTag.Kind.DEPARTMENT, 'subject': subject},
        )
        # Heal older/custom tags that happen to share the subject name.
        changed = []
        if tag.kind != TeacherTag.Kind.DEPARTMENT:
            tag.kind = TeacherTag.Kind.DEPARTMENT
            changed.append('kind')
        if tag.subject_id != subject.id:
            tag.subject = subject
            changed.append('subject')
        if changed:
            tag.save(update_fields=changed)
        tag_cache[subject.id] = tag
        return tag

    tags_created_before = TeacherTag.objects.filter(
        school=school, kind=TeacherTag.Kind.DEPARTMENT,
    ).count()
    assigned = 0
    teachers = Teacher.objects.filter(id__in=primary).prefetch_related('tags')
    for teacher in teachers:
        # Fill-if-empty: respect a department the user set by hand.
        if any(t.kind == TeacherTag.Kind.DEPARTMENT for t in teacher.tags.all()):
            continue
        teacher.tags.add(_dept_tag_for(primary[teacher.id]))
        assigned += 1

    tags_created_after = TeacherTag.objects.filter(
        school=school, kind=TeacherTag.Kind.DEPARTMENT,
    ).count()
    return {
        'department_tags': tags_created_after,
        'department_tags_created': tags_created_after - tags_created_before,
        'teachers_assigned': assigned,
    }


def _primary_subject_by_teacher(school) -> dict[int, Subject]:
    """Map each teacher to their primary academic subject — the one they teach
    the most active hours of, excluding advisory subjects (homeroom). Teachers
    with no academic hours are absent from the result. Tie-break by subject
    name for determinism."""
    subjects = {
        s.id: s for s in Subject.objects.filter(school=school)
        if s.name_he not in _NON_DEPARTMENT_SUBJECTS
    }
    hours: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    agg = (
        Teacher.objects.filter(school=school, assignments__is_active=True)
        .values('id', 'assignments__subject')
        .annotate(h=Sum('assignments__weekly_hours'))
    )
    for r in agg:
        sid = r['assignments__subject']
        if sid in subjects:
            hours[r['id']][sid] += float(r['h'] or 0)

    result: dict[int, Subject] = {}
    for tid, by_subject in hours.items():
        if not by_subject:
            continue
        primary_sid = max(by_subject, key=lambda sid: (by_subject[sid], subjects[sid].name_he))
        result[tid] = subjects[primary_sid]
    return result


def _match_subject(text: str, subjects: list[Subject]) -> Subject | None:
    """Find the subject a coordinator role refers to. Exact name match first,
    then the longest subject name that appears as a substring of ``text``."""
    text = (text or '').strip()
    if not text:
        return None
    for s in subjects:
        if s.name_he == text:
            return s
    best = None
    for s in subjects:
        if s.name_he and s.name_he in text:
            if best is None or len(s.name_he) > len(best.name_he):
                best = s
    return best


def sync_coordinator_tags(school) -> dict[str, int]:
    """Create coordinator tags from ריכוז/רכז role rows and assign their teacher.

    Subject is resolved in order of confidence:
      1. a subject named in the role text (e.g. "ריכוז מתמטיקה");
      2. for a *generic* subject coordinator (role mentions מקצוע but names no
         subject), the teacher's own primary academic subject — so a generic
         coordinator who teaches mostly math becomes the math coordinator;
      3. otherwise None — administrative coordinators (security, trips,
         grade-level) keep their own role title and stay subject-less.
    """
    subjects = list(Subject.objects.filter(school=school))
    primary = _primary_subject_by_teacher(school)
    created = 0
    assigned = 0
    for role in TeacherRole.objects.filter(school=school).select_related('teacher'):
        if not role.teacher_id:
            continue
        blob = f'{role.role_title} {role.context}'
        if not any(marker in blob for marker in _COORDINATOR_MARKERS):
            continue
        subject = _match_subject(role.context, subjects) or _match_subject(role.role_title, subjects)
        if subject is None and 'מקצוע' in blob:
            # Generic "subject coordinator" — infer from what they teach most.
            subject = primary.get(role.teacher_id)
        name = f'רכז/ת {subject.name_he}' if subject else (role.role_title or 'ריכוז').strip()
        tag, was_created = TeacherTag.objects.get_or_create(
            school=school,
            name=name,
            defaults={'kind': TeacherTag.Kind.COORDINATOR, 'subject': subject},
        )
        if was_created:
            created += 1
        else:
            changed = []
            if tag.kind != TeacherTag.Kind.COORDINATOR:
                tag.kind = TeacherTag.Kind.COORDINATOR
                changed.append('kind')
            if subject and tag.subject_id != subject.id:
                tag.subject = subject
                changed.append('subject')
            if changed:
                tag.save(update_fields=changed)
        if not role.teacher.tags.filter(id=tag.id).exists():
            role.teacher.tags.add(tag)
            assigned += 1
    return {'coordinator_tags_created': created, 'coordinators_assigned': assigned}


def sync_all_tags(school) -> dict[str, int]:
    """Run both sync passes. Returns merged stats."""
    stats = sync_department_tags(school)
    stats.update(sync_coordinator_tags(school))
    return stats
