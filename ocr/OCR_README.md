# OCR para el prototipo móvil

El servicio conserva `POST /extract` con cuerpo binario JPEG o PNG y `Content-Type` correspondiente. Ahora devuelve `text`, `raw_text`, `name`, `cedula`, `review_required` y `extraction`. `text` mantiene la compatibilidad con la demo web de Django.

`name` y `cedula` contienen sugerencias o `null`. La extracción busca etiquetas explícitas, como `Nombre:`, `Paciente:`, `Cédula:` y `C.I.:`. Conserva los candidatos en `extraction.name_candidates` y `extraction.cedula_candidates`. Si hay varios valores diferentes, deja el campo principal vacío. El nombre no se deduce a partir de una línea cualquiera y los caracteres OCR de una cédula no se corrigen automáticamente. Una cédula de diez dígitos solo cumple la comprobación de formato del prototipo. La identidad, el dígito verificador y la existencia del paciente quedan pendientes de revisión y de la futura integración.

`review_required` siempre vale `true`. `extraction.warnings` comunica campos ausentes, ambiguos o con formato incorrecto. El parser tiene versión `1`. Tesseract puede necesitar ajustes por formato y calidad de la orden, especialmente en documentos manuscritos. Los resultados del OCR requieren comparación con la imagen.

## Conectar un teléfono en una red de pruebas

Desde la raíz del proyecto, configura un token temporal y la IP local del equipo. PowerShell permite generar el token con Python. El valor se introduce también en los ajustes de la app, nunca en archivos versionados.

```powershell
$env:OCR_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:OCR_BIND_IP = "192.168.1.50"
docker compose -f compose.yaml -f compose.mobile.yaml up --build
```

Sustituye `192.168.1.50` por la IP de tu computador, conecta el teléfono a la misma red y usa `http://192.168.1.50:5050/extract` con ese token en la configuración móvil. Para consultar el token localmente, usa `$env:OCR_API_TOKEN`. El servicio espera `Authorization: Bearer TOKEN`.

El archivo `compose.mobile.yaml` exige un token no vacío. Su dirección predeterminada es `127.0.0.1`, de manera que debes elegir explícitamente la IP de la red de pruebas para acceso desde un teléfono. El Docker Compose original conserva su servicio interno sin publicar el puerto OCR. Al activar el perfil móvil, Django envía también el token al OCR para mantener la demo web operativa.

Esta ruta HTTP local está destinada a imágenes sintéticas durante el desarrollo. El envío de expedientes reales requiere el acceso autenticado y HTTPS definidos en el plan de Laravel. Algunas compilaciones móviles restringen HTTP local y pueden necesitar una URL HTTPS de desarrollo.

## Límites y pruebas

El servicio admite archivos de hasta 8 MiB, valida que el contenido real corresponda a JPEG o PNG y limita la imagen a 20 megapíxeles. Tesseract tiene un tiempo máximo de 20 segundos. El endpoint `/health` informa si el ejecutable está instalado. Las respuestas llevan `Cache-Control: no-store`.

```powershell
python -m unittest discover -s ocr -p "test_*.py" -v
```

Las pruebas de `test_fields.py` usan solo la biblioteca estándar de Python. Las pruebas HTTP de `test_app.py` requieren las dependencias de `ocr/requirements.txt` y sustituyen el reconocimiento de Tesseract para verificar el contrato, autenticación y manejo de imágenes. Una prueba con imágenes reales y el ejecutable OCR sigue siendo necesaria para evaluar exactitud.
