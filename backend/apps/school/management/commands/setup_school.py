"""
Management command to set up initial school data with grades and time slots.
"""
from datetime import time, timedelta, datetime
from django.core.management.base import BaseCommand
from apps.school.models import School, Grade, TimeSlot


GRADES = [
    ('ז', 7), ('ח', 8), ('ט', 9), ('י', 10), ('יא', 11), ('יב', 12),
]


class Command(BaseCommand):
    help = 'Set up initial school with grades and time slots'

    def handle(self, *args, **options):
        school, created = School.objects.get_or_create(
            id=1,
            defaults={
                'name': 'בית הספר',
                'days_per_week': 5,
                'periods_per_day': 10,
                'period_duration_minutes': 45,
                'first_period_start': time(8, 0),
            },
        )
        action = 'Created' if created else 'Already exists'
        self.stdout.write(f'{action}: {school}')

        # Create grades
        for name, level in GRADES:
            grade, created = Grade.objects.get_or_create(
                school=school, level=level,
                defaults={'name': name, 'order': level},
            )
            if created:
                self.stdout.write(f'  Created grade: {name}')

        # Create time slots (Sun-Thu, 10 periods)
        period_start = datetime(2025, 1, 1, 8, 0)  # 08:00
        duration = timedelta(minutes=45)
        break_duration = timedelta(minutes=10)

        for period in range(1, 11):
            start = period_start.time()
            end = (period_start + duration).time()

            for day in range(1, 6):  # Sun=1 through Thu=5
                TimeSlot.objects.get_or_create(
                    school=school, day=day, period=period,
                    defaults={'start_time': start, 'end_time': end},
                )

            # Move to next period
            period_start = period_start + duration + break_duration
            # Add longer break after period 2 and period 6
            if period == 2:
                period_start = period_start + timedelta(minutes=10)  # 20 min break
            elif period == 6:
                period_start = period_start + timedelta(minutes=20)  # 30 min lunch

        self.stdout.write(self.style.SUCCESS('School setup complete!'))
