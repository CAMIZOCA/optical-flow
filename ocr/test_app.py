import os
import subprocess
import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from app import app


def png_bytes(size=(60, 40)):
    output = BytesIO()
    Image.new("RGB", size, "white").save(output, format="PNG")
    return output.getvalue()


class OcrApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.environment = patch.dict(os.environ, {"OCR_API_TOKEN": "test-token"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.headers = {"Authorization": "Bearer test-token", "Content-Type": "image/png"}

    @patch("app.recognize", return_value="Nombre: Elena Demo\nCédula: 1712345678")
    def test_preserves_text_and_adds_separate_fields(self, recognize):
        response = self.client.post("/extract", data=png_bytes(), headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["name"], "Elena Demo")
        self.assertEqual(response.json["cedula"], "1712345678")
        self.assertEqual(response.json["raw_text"], response.json["text"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertTrue(response.json["review_required"])
        recognize.assert_called_once()

    @patch("app.recognize")
    def test_missing_wrong_and_unicode_tokens_are_rejected(self, recognize):
        for header in (None, "Bearer wrong", "Bearer ñ"):
            with self.subTest(header=header):
                headers = {"Content-Type": "image/png"}
                if header:
                    headers["Authorization"] = header
                response = self.client.post("/extract", data=png_bytes(), headers=headers)
                self.assertEqual(response.status_code, 401)
        recognize.assert_not_called()

    @patch("app.recognize", return_value="Texto sin identificación")
    def test_internal_legacy_mode_remains_compatible(self, recognize):
        with patch.dict(os.environ, {"OCR_API_TOKEN": ""}):
            response = self.client.post("/extract", data=png_bytes(), content_type="image/png")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json["name"])
        self.assertIsNone(response.json["cedula"])

    @patch("app.recognize")
    def test_corrupt_and_mislabeled_images_are_rejected(self, recognize):
        response = self.client.post("/extract", data=b"not an image", headers=self.headers)
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/extract", data=png_bytes(), headers={**self.headers, "Content-Type": "image/jpeg"})
        self.assertEqual(response.status_code, 400)
        recognize.assert_not_called()

    @patch("app.recognize")
    def test_image_pixel_limit(self, recognize):
        response = self.client.post("/extract", data=png_bytes((5000, 4001)), headers=self.headers)
        self.assertEqual(response.status_code, 400)
        recognize.assert_not_called()

    @patch("app.recognize")
    def test_request_size_limit_returns_json(self, recognize):
        response = self.client.post("/extract", data=b"x" * (8 * 1024 * 1024 + 1), headers=self.headers)
        self.assertEqual(response.status_code, 413)
        self.assertIn("error", response.json)
        recognize.assert_not_called()

    @patch("app.recognize", side_effect=subprocess.TimeoutExpired("tesseract", 20))
    def test_ocr_timeout_is_reported(self, recognize):
        response = self.client.post("/extract", data=png_bytes(), headers=self.headers)
        self.assertEqual(response.status_code, 504)


if __name__ == "__main__":
    unittest.main()
