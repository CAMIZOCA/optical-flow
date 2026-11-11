# Plan de mejoras de Optical Flow

Empieza por automatizar la verificación del flujo actual con datos sintéticos. En paralelo, mide el OCR con imágenes representativas antes de cambiar su configuración. Completa los controles de la tercera etapa antes de usar expedientes reales.

## 1. Asegurar la demo

- [ ] **Fijar dependencias.** Generar y versionar el lockfile de npm, usar `npm ci` en la imagen web y registrar versiones resueltas para Python. Verificar que una compilación desde cero instala las mismas versiones de las dependencias.
- [ ] **Cubrir el flujo con pruebas.** Automatizar carga, OCR, edición, aprobación, descarga y persistencia después de reiniciar. Incluir imágenes inválidas, reintentos tras un fallo de OCR y aprobación fuera de estado. Usar imágenes sintéticas en todas las pruebas.
- [ ] **Configurar GitHub Actions.** Ejecutar las pruebas y las comprobaciones de Django y TypeScript en cada pull request. La ejecución debe indicar qué servicio falló y publicar sus registros cuando falle la prueba de integración.

## 2. Mejorar el OCR y la revisión

- [ ] **Medir la calidad del OCR.** Preparar un conjunto sintético con transcripciones esperadas y variaciones de orientación, contraste y resolución. Registrar error de caracteres y tiempo de respuesta para comparar cambios de preprocesamiento y configuración de Tesseract.
- [ ] **Ejecutar el OCR en segundo plano.** Mover el trabajo a una cola, mostrar su progreso y definir la política de reintentos. Verificar que dos solicitudes para la misma captura no generan trabajos simultáneos y que una interrupción permite recuperar el trabajo.
- [ ] **Facilitar la revisión de lotes.** Añadir filtros por estado, búsqueda por referencia y paginación. Verificar que se puede encontrar y revisar una captura aunque ya no aparezca entre las 50 más recientes.

## 3. Preparar un piloto con expedientes reales

- [ ] **Restringir y registrar el acceso.** Incorporar autenticación, permisos por rol y por expediente, y un registro de accesos, aprobaciones y descargas. Probar el acceso denegado para cada operación que requiera permisos.
- [ ] **Proteger y conservar los datos.** Configurar HTTPS y secretos externos al repositorio. Definir retención, eliminación y respaldos de originales y base de datos. Verificar una restauración completa en un entorno de prueba.
- [ ] **Validar el despliegue.** Reemplazar los servidores de desarrollo, revisar la capacidad de la base de datos y medir latencia, fallos de OCR y profundidad de la cola. Probar el despliegue y la recuperación con datos sintéticos antes del piloto.

## 4. Integrar otros sistemas

- [ ] **Documentar y versionar el contrato de la API.** Describir estados, formatos, errores, límites y permisos. Validar el contrato con clientes de prueba antes de incorporar integraciones.
- [ ] **Crear el cliente Android en Kotlin.** Capturar una foto, enviarla a la API y consultar su estado. Verificar que se puede reintentar una subida interrumpida sin duplicar la captura.
- [ ] **Integrar Laravel y PHP.** Vincular un documento aprobado al expediente correcto. Verificar que repetir una solicitud no duplica el adjunto y que los errores quedan registrados.
- [ ] **Evaluar avisos y webhooks.** Definir los eventos y sus consumidores antes de elegir si hacen falta servicios separados en NestJS o Express.js. Verificar autenticación, reintentos y deduplicación de entregas.
