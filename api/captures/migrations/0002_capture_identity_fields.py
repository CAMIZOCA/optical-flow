from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("captures", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="capture",
            name="name",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddField(
            model_name="capture",
            name="cedula",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
    ]
