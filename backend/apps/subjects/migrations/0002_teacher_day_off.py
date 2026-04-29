from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subjects', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='teacher',
            name='day_off',
            field=models.IntegerField(
                blank=True,
                choices=[
                    (1, 'ראשון'), (2, 'שני'), (3, 'שלישי'),
                    (4, 'רביעי'), (5, 'חמישי'),
                ],
                null=True,
                verbose_name='יום חופש',
            ),
        ),
    ]
