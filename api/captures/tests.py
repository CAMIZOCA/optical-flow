import json
import os
import tempfile
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from PIL import Image

from .models import Capture


class CaptureApiTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        settings = override_settings(MEDIA_ROOT=directory.name, ALLOWED_HOSTS=["testserver"])
        settings.enable()
        self.addCleanup(settings.disable)
        self.client = Client(enforce_csrf_checks=True)
        response = self.client.get("/api/captures/")
        self.csrf = response.cookies["csrftoken"].value

    def post(self, url, data=None, content_type=None):
        options = {"HTTP_X_CSRFTOKEN": self.csrf}
        if content_type:
            options["content_type"] = content_type
        return self.client.post(url, data=data, **options)

    def upload(self):
        image = BytesIO()
        Image.new("RGB", (100, 60), "white").save(image, format="PNG")
        response = self.post("/api/captures/", {
            "image": SimpleUploadedFile("test.png", image.getvalue(), content_type="image/png"),
        })
        self.assertEqual(response.status_code, 201)
        return response.json()

    def recognize(self, capture, data):
        with patch("captures.views.urlopen", return_value=BytesIO(json.dumps(data).encode("utf-8"))):
            return self.post(f"/api/captures/{capture['id']}/ocr/")

    def test_upload_ocr_review_and_download_preserve_identity(self):
        capture = self.upload()
        result = self.recognize(capture, {"text": "OCR original", "name": "Elena Derno", "cedula": "1712345678"})
        self.assertEqual(result.json()["name"], "Elena Derno")
        self.assertEqual(result.json()["cedula"], "1712345678")
        response = self.post(f"/api/captures/{capture['id']}/approve/", {
            "patient_reference": "DEMO-001",
            "reviewed_text": "Texto corregido",
            "name": "Elena Demo",
            "cedula": "1712345678",
        }, "application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "approved")
        saved = self.client.get("/api/captures/").json()["captures"][0]
        self.assertEqual(saved["name"], "Elena Demo")
        self.assertEqual(saved["raw_text"], "OCR original")
        self.assertEqual(saved["patient_reference"], "DEMO-001")
        download = self.client.get(saved["image_url"] + "?download=1")
        self.assertEqual(download.status_code, 200)
        download.close()

    def test_legacy_ocr_and_approval_still_work(self):
        capture = self.upload()
        result = self.recognize(capture, {"text": "Legacy OCR text"})
        self.assertEqual(result.json()["name"], "")
        self.assertEqual(result.json()["cedula"], "")
        result = self.post(f"/api/captures/{capture['id']}/approve/", {
            "patient_reference": "LEGACY-1", "reviewed_text": "Reviewed",
        }, "application/json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["patient_reference"], "LEGACY-1")

    def test_null_and_invalid_ocr_suggestions_are_empty(self):
        for name, cedula in ((None, None), (123, "abc"), ("x" * 161, "1" * 11)):
            capture = self.upload()
            result = self.recognize(capture, {"text": "Texto", "name": name, "cedula": cedula})
            self.assertEqual(result.json()["state"], "ready")
            self.assertEqual(result.json()["name"], "")
            self.assertEqual(result.json()["cedula"], "")

    def test_invalid_review_keeps_capture_reviewable(self):
        capture = self.upload()
        self.recognize(capture, {"text": "Texto", "name": "Elena Demo", "cedula": "1712345678"})
        for value in (None, "17123O5678", "1234", 1712345678):
            result = self.post(f"/api/captures/{capture['id']}/approve/", {
                "patient_reference": "DEMO-1", "reviewed_text": "Texto", "cedula": value,
            }, "application/json")
            self.assertEqual(result.status_code, 400)
        capture = Capture.objects.get(pk=capture["id"])
        self.assertEqual(capture.state, "ready")
        self.assertEqual(capture.cedula, "1712345678")

    def test_missing_optional_fields_keep_existing_suggestions(self):
        capture = self.upload()
        self.recognize(capture, {"text": "Texto", "name": "Elena Demo", "cedula": "1712345678"})
        result = self.post(f"/api/captures/{capture['id']}/approve/", {
            "patient_reference": "DEMO-1", "reviewed_text": "Texto",
        }, "application/json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["name"], "Elena Demo")
        self.assertEqual(result.json()["cedula"], "1712345678")

    def test_bad_upload_does_not_block_next_image(self):
        response = self.post("/api/captures/", {
            "image": SimpleUploadedFile("bad.png", b"not an image", content_type="image/png"),
        })
        self.assertEqual(response.status_code, 400)
        self.upload()
        self.assertEqual(Capture.objects.count(), 1)

    def test_authentication_is_forwarded_to_ocr(self):
        capture = self.upload()
        with patch.dict(os.environ, {"OCR_API_TOKEN": "test-token"}):
            with patch("captures.views.urlopen", return_value=BytesIO(b'{"text":"hello"}')) as call:
                result = self.post(f"/api/captures/{capture['id']}/ocr/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(call.call_args.args[0].get_header("Authorization"), "Bearer test-token")


class CaptureMigrationTests(TransactionTestCase):
    def test_existing_records_survive_new_fields(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("captures", "0001_initial")])
        old_apps = executor.loader.project_state([("captures", "0001_initial")]).apps
        old_capture = old_apps.get_model("captures", "Capture").objects.create(
            original="legacy.png", image_type="image/png", state="approved",
            patient_reference="LEGACY-001", raw_text="Original", reviewed_text="Reviewed",
        )
        executor = MigrationExecutor(connection)
        executor.migrate([("captures", "0002_capture_identity_fields")])
        migrated = Capture.objects.get(pk=old_capture.pk)
        self.assertEqual(migrated.patient_reference, "LEGACY-001")
        self.assertEqual(migrated.state, "approved")
        self.assertEqual(migrated.reviewed_text, "Reviewed")
        self.assertEqual(migrated.name, "")
        self.assertEqual(migrated.cedula, "")
