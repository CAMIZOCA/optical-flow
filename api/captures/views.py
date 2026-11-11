import json
import os
import re
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from PIL import Image, UnidentifiedImageError

from .models import Capture

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
IMAGE_TYPES = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png")}
RETRYABLE = (Capture.State.PENDING, Capture.State.FAILED)


def serialize(capture):
    return {
        "id": str(capture.id),
        "state": capture.state,
        "raw_text": capture.raw_text,
        "reviewed_text": capture.reviewed_text,
        "patient_reference": capture.patient_reference,
        "name": capture.name,
        "cedula": capture.cedula,
        "created_at": capture.created_at.isoformat(),
        "image_url": f"/api/captures/{capture.id}/image/",
    }


def error(message, status):
    return JsonResponse({"error": message}, status=status)


@ensure_csrf_cookie
@require_http_methods(["GET", "POST"])
def captures(request):
    if request.method == "GET":
        latest = Capture.objects.order_by("-created_at")[:50]
        return JsonResponse({"captures": [serialize(capture) for capture in latest]})

    uploaded = request.FILES.get("image")
    if not uploaded or not 0 < uploaded.size <= MAX_BYTES:
        return error("Elige una imagen de hasta 8 MB.", 400)

    try:
        with Image.open(uploaded) as photo:
            image_type = IMAGE_TYPES.get(photo.format)
            if not image_type or photo.width * photo.height > MAX_PIXELS:
                return error("Usa una imagen JPEG o PNG de hasta 20 megapíxeles.", 400)
            photo.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return error("La imagen no se puede leer.", 400)
    uploaded.seek(0)

    mime_type, extension = image_type
    capture = Capture(image_type=mime_type)
    capture.original.save(f"{capture.id}.{extension}", uploaded)
    return JsonResponse(serialize(capture), status=201)


@require_POST
def extract(request, capture_id):
    capture = get_object_or_404(Capture, pk=capture_id)
    if capture.state not in RETRYABLE:
        return JsonResponse(serialize(capture))

    with capture.original.open("rb") as original:
        body = original.read()
    headers = {"Content-Type": capture.image_type}
    token = os.environ.get("OCR_API_TOKEN", "")
    if token:
        headers["Authorization"] = "Bearer " + token
    ocr_request = Request(
        os.environ.get("OCR_URL", "http://127.0.0.1:5000/extract"),
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(ocr_request, timeout=30) as response:
            result = json.load(response)
            text = result["text"]
        if not isinstance(text, str) or len(text) > 20_000:
            raise ValueError("Invalid OCR response")
        name = result.get("name") or ""
        cedula = result.get("cedula") or ""
        if not isinstance(name, str) or len(name) > 160:
            name = ""
        if not isinstance(cedula, str) or (cedula and not re.fullmatch(r"[0-9]{10}", cedula)):
            cedula = ""
    except (URLError, OSError, ValueError, KeyError, TypeError):
        Capture.objects.filter(pk=capture_id, state__in=RETRYABLE).update(state=Capture.State.FAILED)
        capture.refresh_from_db()
        return JsonResponse(serialize(capture))

    Capture.objects.filter(pk=capture_id, state__in=RETRYABLE).update(
        state=Capture.State.READY, raw_text=text, name=name, cedula=cedula
    )
    capture.refresh_from_db()
    return JsonResponse(serialize(capture))


@require_POST
def approve(request, capture_id):
    capture = get_object_or_404(Capture, pk=capture_id)
    try:
        payload = json.loads(request.body)
        if not isinstance(payload, dict):
            raise ValueError("Expected an object")
        reference = payload.get("patient_reference")
        text = payload.get("reviewed_text")
        name = payload.get("name", capture.name)
        cedula = payload.get("cedula", capture.cedula)
        if not all(isinstance(value, str) for value in (reference, text, name, cedula)):
            raise ValueError("Expected strings")
        reference, text = reference.strip(), text.strip()
        name, cedula = name.strip(), cedula.strip()
    except (ValueError, UnicodeError):
        return error("Envía una referencia y un texto revisado válidos.", 400)

    if not 0 < len(reference) <= 80 or not 0 < len(text) <= 20_000:
        return error("La referencia y el texto revisado son obligatorios.", 400)
    if len(name) > 160 or (cedula and not re.fullmatch(r"[0-9]{10}", cedula)):
        return error("Revisa el nombre y la cédula. La cédula debe tener diez dígitos o quedar vacía.", 400)

    updated = Capture.objects.filter(pk=capture_id, state=Capture.State.READY).update(
        patient_reference=reference, reviewed_text=text, name=name, cedula=cedula, state=Capture.State.APPROVED
    )
    if not updated:
        return error("Solo puedes aprobar una captura lista para revisión.", 409)
    capture.refresh_from_db()
    return JsonResponse(serialize(capture))


@require_GET
def image(request, capture_id):
    capture = get_object_or_404(Capture, pk=capture_id)
    download = request.GET.get("download") == "1"
    if download and capture.state != Capture.State.APPROVED:
        return error("Aprueba la captura antes de descargarla.", 409)
    return FileResponse(
        capture.original.open("rb"),
        content_type=capture.image_type,
        as_attachment=download,
        filename=capture.original.name.rsplit("/", 1)[-1],
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
