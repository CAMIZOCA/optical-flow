import os
import shutil
import subprocess

from flask import Flask, jsonify, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024


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
    if request.mimetype not in {"image/jpeg", "image/png"}:
        return jsonify(error="Formato de imagen no admitido."), 415
    image = request.get_data()
    if not image:
        return jsonify(error="La imagen está vacía."), 400

    try:
        return jsonify(text=recognize(image))
    except subprocess.TimeoutExpired:
        return jsonify(error="El reconocimiento superó el tiempo máximo."), 504
    except (subprocess.CalledProcessError, OSError, UnicodeError):
        return jsonify(error="No se pudo ejecutar el reconocimiento."), 502
