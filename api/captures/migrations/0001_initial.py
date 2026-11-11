import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="Capture",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("original", models.FileField(upload_to="captures")),
                ("image_type", models.CharField(max_length=16)),
                ("state", models.CharField(choices=[("pending", "Pendiente"), ("ready", "Lista para revisar"), ("failed", "Error de OCR"), ("approved", "Aprobada")], default="pending", max_length=8)),
                ("raw_text", models.TextField(blank=True)),
                ("reviewed_text", models.TextField(blank=True)),
                ("patient_reference", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        )
    ]
