# Optical Flow para Expo

Prototipo para Android e iOS en Expo SDK 58, React Native y TypeScript. Cada foto guarda su original en el espacio de documentos de la app, un JPEG de hasta 3000 píxeles de lado largo con calidad 0.92 y una miniatura de 320 píxeles. El original se conserva para recuperar detalles si la compresión afecta la lectura. Metadatos, correcciones, estado e historial quedan en SQLite local.

## Arranque

Desde `mobile/`, con Node 22.13 o superior, ejecuta:

```sh
npm ci
npx expo start
```

Abre el QR con Expo Go en un dispositivo Android o iPhone. El botón **Abrir cámara** permite tomar fotos sucesivas sin cerrar la vista; **Seleccionar varias fotos** importa un lote desde la galería. En **Revisión** puedes corregir nombre, cédula, fecha y texto. El nombre y la cédula requieren confirmación antes de marcar una orden como revisada. Para cédulas ausentes, guarda el borrador y deja pendiente la decisión de asociación.

## OCR en la red de pruebas

Desde la raíz del repositorio, en PowerShell, configura un token temporal y la IP local de tu computadora:

```powershell
$env:OCR_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:OCR_BIND_IP = "192.168.1.50"
docker compose -f compose.yaml -f compose.mobile.yaml up --build
```

Sustituye la IP de ejemplo por la IP de tu computador. El celular debe estar en la misma red. En **Ajustes** introduce `http://192.168.1.50:5050/extract` y el valor de `$env:OCR_API_TOKEN`, y pulsa **Guardar y procesar pendientes**. La app enviará los JPEG optimizados de uno en uno en primer plano. Si falla la red, la orden se conserva localmente y puedes reintentar. Para datos reales, prepara un endpoint HTTPS autenticado y el control de acceso descrito en el [plan](../docs/PLAN_DE_TRABAJO.md).

Esta versión registra una foto como una orden independiente. Agrupar varias páginas de una misma orden, buscar pacientes y vincular consultas históricas en Laravel son fases siguientes. La carpeta `mobile/node_modules` y los archivos locales de escaneos no se versionan en Git.

## Comprobaciones

```sh
npm run typecheck
npm test
```
