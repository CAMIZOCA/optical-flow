# Contrato previsto de API para Optical Flow

Diseño para implementar en Laravel durante la fase 1. Las rutas de este documento son futuras. El prototipo Expo utiliza almacenamiento local y el adaptador OCR disponible en esta entrega.

## Convenciones

- Base prevista `/api/v1`.
- Token Bearer de Sanctum por usuario/dispositivo, con permisos por operación.
- Fechas e instantes en ISO 8601. Identificadores UUID generados por el cliente para lotes y capturas.
- Los cambios de revisión incluyen un número `revision` para detectar edición concurrente.
- `Idempotency-Key` es estable por operación. Una clave reutilizada con otro contenido devuelve conflicto.
- Las imágenes se envían individualmente y pertenecen a un `batch_id`.
- Errores devuelven `error.code`, `error.message` y, cuando corresponde, `error.fields`.

## Rutas

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| POST /auth/tokens | Credenciales y etiqueta del dispositivo | Token y perfil autorizado |
| DELETE /auth/tokens/current | Token actual | Revocación de sesión del dispositivo |
| POST /batches | ID local, etiqueta y procedencia | Lote persistido o resultado idempotente existente |
| GET /batches/{id} | ID | Conteos por estado y metadatos |
| POST /captures | Multipart con image, client_capture_id, batch_id, captured_at y source | 201 inicial o resultado existente en reintento |
| GET /captures/{id} | ID | Estado de subida/OCR/revisión, campos y acceso autorizado a imagen |
| GET /captures | Filtros de lote, estado y cursor | Lista paginada |
| POST /captures/{id}/ocr-runs | Motor opcional y clave de idempotencia | Trabajo encolado, respuesta 202 |
| PATCH /captures/{id}/review | Nombre, documento, fecha, notas y revision | Nueva revisión persistida |
| POST /captures/{id}/approve | revision | Aprobación o conflicto si cambió el documento |
| GET /patients/candidates | Tipo/número revisado y nombre opcional | Candidatos consultados en Óptica Andina, fase 3 |
| POST /documents/{id}/patient-link | ID de paciente elegido y revision | Confirmación local de la asociación |
| POST /documents/{id}/deliveries | Clave estable de integración | Entrega encolada, fase 3 |
| GET /documents/{id}/deliveries/latest | ID | Estado y referencia remota |

## Ejemplo de revisión

```json
{
  "revision": 2,
  "reviewed_name": "Elena Demo",
  "document_type": "cedula",
  "reviewed_document_number": "",
  "historical_date": null,
  "notes": "Número de documento pendiente de confirmar en el archivo físico"
}
```

El número vacío refleja un dato pendiente. La API puede guardar el borrador, y la política de aprobación determina qué información adicional se requiere para pasar a identificación. No se reemplaza un dato ausente por un número inventado.

## Ejemplo de captura central

```json
{
  "id": "fe773a83-80c6-4f48-8b87-a5232dfab06c",
  "client_capture_id": "fe773a83-80c6-4f48-8b87-a5232dfab06c",
  "batch_id": "b7d286e3-581d-4b47-90c0-cfda713a3b09",
  "upload_state": "uploaded",
  "ocr_state": "completed",
  "review_state": "pending",
  "association_state": "unresolved",
  "integration_state": "not_ready",
  "raw_text": "PACIENTE: ELENA DEMO",
  "proposed_name": "ELENA DEMO",
  "proposed_document_number": "",
  "reviewed_name": null,
  "reviewed_document_number": null,
  "historical_date": null,
  "revision": 1
}
```

## Idempotencia y reintentos

La base aplica una restricción única a `(device_id, client_capture_id)` y otra a la clave de integración. Un reintento con mismos datos devuelve el resultado original. Otro archivo con la misma clave devuelve HTTP 409 para impedir que una captura distinta sobrescriba la primera.

El servidor confirma una captura después de almacenar y comprobar su archivo. La cola OCR se publica después de confirmar la transacción. Si el motor falla, la imagen sigue disponible y el trabajo se marca fallido con un código recuperable. Reintentar OCR crea una ejecución nueva y conserva el resultado anterior.

Una entrega a Óptica Andina incluye el ID estable de documento como referencia externa. Si el sistema clínico acepta esa referencia como única, la asociación es idempotente. Si carece de esa capacidad, el adaptador debe reconciliar primero por una consulta de referencia antes de reintentar una operación con resultado desconocido. Este comportamiento se confirmará al inspeccionar la API clínica.

## Asociación histórica

1. El operador revisa la identidad extraída y la fecha cuando esté disponible.
2. Optical Flow consulta candidatos por número de documento. Las búsquedas por nombre se presentan para selección humana.
3. El operador confirma el paciente existente.
4. El adaptador solicita el archivo/adjunto histórico utilizando el tipo de registro que soporte Óptica Andina.
5. Se guarda el ID remoto y el instante de confirmación.

Si el paciente no aparece, el documento queda en `needs_patient_creation`. El proceso de alta se define con Óptica Andina en la siguiente fase. La fecha de la atención histórica y el instante de importación permanecen separados.

## Requisitos de pruebas del contrato

- Dos solicitudes simultáneas para la misma captura devuelven un único registro.
- Un timeout seguido de reintento no produce dos adjuntos.
- Un token de un usuario sin acceso al lote no puede leer sus archivos.
- Una edición con `revision` obsoleta devuelve 409 y conserva la revisión vigente.
- Una respuesta OCR vacía permite revisión manual y conserva la imagen.
- Una cédula con cero inicial se conserva como texto.
- Un nombre similar no vincula automáticamente dos pacientes.
- Un documento sin fecha no adquiere la fecha de digitalización como fecha clínica.
