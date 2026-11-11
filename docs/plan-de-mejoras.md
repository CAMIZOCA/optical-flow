# Plan de mejoras de Optical Flow

Actualizado el 11 de noviembre de 2026. La app móvil pasa a Expo para Android e iOS y el futuro control central de datos corresponde a una API independiente Laravel. Los detalles de fases, agentes y aceptación están en [PLAN_DE_TRABAJO.md](PLAN_DE_TRABAJO.md), [ARQUITECTURA.md](ARQUITECTURA.md) y [API_CONTRACT.md](API_CONTRACT.md).

El prototipo permite avanzar con la captura y revisión. Las tareas siguientes conservan los controles del plan anterior y añaden el flujo de archivo histórico solicitado. Una casilla pendiente requiere evidencia de cierre en código, pruebas o documentación.

## 1. Asegurar la demo

- [ ] **Fijar dependencias.** Generar y versionar los lockfiles de npm, usar `npm ci` en las imágenes web/móvil y registrar versiones resueltas para Python. Verificar una compilación desde cero con las mismas versiones de dependencias.
- [ ] **Cubrir el flujo con pruebas.** Automatizar carga, OCR, ediciones, aprobación, descarga y persistencia después de reiniciar. Incluir imágenes inválidas, reintentos tras fallo OCR, identidad parcial y aprobación fuera de estado. Usar imágenes sintéticas.
- [ ] **Configurar GitHub Actions.** Ejecutar pruebas y comprobaciones de Django, Python y TypeScript en cada pull request. Identificar el servicio que falla y adjuntar sus registros en la prueba de integración.

## 2. Captura móvil y revisión de lotes

- [ ] **Validar Expo en Android e iOS.** Probar permisos, cámara continua, toma repetida e importación múltiple en dispositivos físicos. La pantalla de cámara debe permanecer abierta después de cada fotografía.
- [ ] **Comprobar almacenamiento local.** Confirmar que fuente, derivada, miniatura, campos y estados persisten tras cerrar la app. Probar falta de espacio y recuperación de registros incompletos.
- [ ] **Evaluar la optimización.** Comparar la fuente con la derivada JPEG de calidad 0.92 y máximo 3000 píxeles de lado largo. Conservar la fuente, evitar ampliación y registrar dimensiones/peso.
- [ ] **Medir la calidad del OCR.** Preparar transcripciones esperadas con variaciones de orientación, contraste y resolución. Medir exactitud de nombre/cédula, error de caracteres y tiempo de respuesta. Incluir manuscritos representativos del archivo en el piloto autorizado.
- [ ] **Separar campos y procedencia.** Mantener el texto OCR original, nombre propuesto, cédula propuesta, correcciones humanas y eventos de revisión. Conservar ceros iniciales y permitir datos pendientes.
- [ ] **Procesar la cola de forma recuperable.** Una imagen por solicitud y concurrencia inicial uno dentro de lotes lógicos. Confirmar que un reintento no duplica registros. La cola móvil se reanuda con la app abierta.
- [ ] **Ejecutar OCR en segundo plano en el servidor.** En la fase Laravel, mover el trabajo a una cola, mostrar progreso y definir reintentos. Evitar trabajos simultáneos para la misma ejecución y recuperar interrupciones.
- [ ] **Facilitar la revisión de lotes.** Añadir filtros por estado, búsqueda por cédula/nombre, referencia y paginación. Poder revisar una captura aunque ya no aparezca entre las 50 más recientes.
- [ ] **Completar la ingestión web.** Seleccionar varias imágenes, ver resultados por archivo y reintentar únicamente las que fallen. Incorporar agrupación manual de páginas de una orden.

## 3. Preparar un piloto con expedientes reales

- [ ] **Restringir y registrar el acceso.** Incorporar autenticación, permisos por rol y expediente, y registro de accesos, correcciones, aprobaciones y descargas. Probar acceso denegado por operación.
- [ ] **Proteger y conservar los datos.** Configurar HTTPS y secretos externos al repositorio. Definir retención, eliminación y respaldos de originales, derivadas y base. Verificar una restauración completa.
- [ ] **Validar el despliegue.** Reemplazar servidores de desarrollo, revisar capacidad de base/almacenamiento y medir latencia, fallos OCR y profundidad de cola. Probar despliegue y recuperación con datos sintéticos.

## 4. Laravel e integración clínica

- [ ] **Implementar la API central Laravel.** Usar el contrato versionado para usuarios, dispositivos, lotes, archivos privados, OCR, revisión y auditoría. Versionar migraciones y restricciones de idempotencia.
- [ ] **Validar el contrato con clientes.** Describir estados, formatos, errores, límites y permisos. Probar Expo y web contra una API de prueba antes de conectar producción.
- [ ] **Buscar y confirmar pacientes.** Consultar candidatos por documento y permitir revisión humana. El paciente ausente queda pendiente de la política de alta.
- [ ] **Vincular documentos históricos.** Asociar el documento aprobado al expediente confirmado y al tipo de atención anterior que soporte el sistema. Conservar por separado fecha de la orden y digitalización.
- [ ] **Garantizar integración idempotente.** Repetir una solicitud debe producir un solo adjunto. Registrar resultados ambiguos y reconciliar antes de repetir una creación.
- [ ] **Definir alta de pacientes.** Confirmar campos, permisos y pasos adicionales con Óptica Andina antes de implementar la creación desde Optical Flow.
- [ ] **Evaluar avisos y webhooks.** Definir eventos y consumidores antes de decidir si hacen falta servicios separados en NestJS o Express.js. Verificar autenticación, reintentos y deduplicación.
