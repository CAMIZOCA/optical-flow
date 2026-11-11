import uuid

from django.db import models


class Capture(models.Model):
    class State(models.TextChoices):
        PENDING = "pending", "Pendiente"
        READY = "ready", "Lista para revisar"
        FAILED = "failed", "Error de OCR"
        APPROVED = "approved", "Aprobada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    original = models.FileField(upload_to="captures")
    image_type = models.CharField(max_length=16)
    state = models.CharField(max_length=8, choices=State.choices, default=State.PENDING)
    raw_text = models.TextField(blank=True)
    reviewed_text = models.TextField(blank=True)
    patient_reference = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
