import os
import hmac
import shutil
import subprocess
from io import BytesIO

from flask import Flask, jsonify, request
from PIL import Image, UnidentifiedImageError

from fields import extract_fields

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000


@app.after_request
def prevent_response_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(413)
def image_too_large(error):
    return jsonify(error="La imagen supera el límite de 8 MiB."), 413


def recognize(image):
    command = ["tesseract", "stdin", "stdout", "-l", os.environ.get("OCR_LANGUAGE", "spa"), "--psm", "6"]
    result = subprocess.run(command, input=image, capture_output=True, check=True, timeout=20)
    return result.stdout.decode("utf-8").strip()


@app.get("/health")
def health():
    available = shutil.which("tesseract") is not None
    return jsonify(ok=available), 200 if available else 503


@app.post("/extract")
def extract():
    token = os.environ.get("OCR_API_TOKEN", "")
    expected = "Bearer " + token
    if token and not hmac.compare_digest(request.headers.get("Authorization", "").encode("utf-8"), expected.encode("utf-8")):
        return jsonify(error="Token de OCR inválido."), 401
    if request.mimetype not in {"image/jpeg", "image/png"}:
        return jsonify(error="Formato de imagen no admitido."), 415
    image = request.get_data()
    if not image:
        return jsonify(error="La imagen está vacía."), 400

    try:
        with Image.open(BytesIO(image)) as photo:
            actual_type = {"JPEG": "image/jpeg", "PNG": "image/png"}.get(photo.format)
            if actual_type != request.mimetype or photo.width * photo.height > MAX_PIXELS:
                return jsonify(error="Usa JPEG o PNG de hasta 20 megapíxeles."), 400
            photo.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return jsonify(error="La imagen no se puede leer."), 400

    try:
        text = recognize(image)
        return jsonify(text=text, raw_text=text, **extract_fields(text))
    except subprocess.TimeoutExpired:
        return jsonify(error="El reconocimiento superó el tiempo máximo."), 504
    except (subprocess.CalledProcessError, OSError, UnicodeError):
        return jsonify(error="No se pudo ejecutar el reconocimiento."), 502
