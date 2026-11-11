# Plan de trabajo de Optical Flow

Versión de planificación 0.2 · 11 de noviembre de 2026

## Objetivo de Óptica Andina

Digitalizar las órdenes de trabajo antiguas, empezando por aproximadamente dos años de archivo físico. Cada imagen debe conservarse, producir una propuesta de nombre y cédula en campos separados, pasar por revisión y finalmente asociarse a un paciente existente como documento de una atención histórica.

La captura debe permitir fotografiar una orden, guardarla y seguir con la siguiente sin volver a abrir la cámara. La app será Expo para Android e iOS. El operador también podrá seleccionar varias imágenes. La carga múltiple desde una web forma parte de la siguiente fase de ingestión.

## Decisiones acordadas y decisiones de diseño

| Tema | Decisión | Estado |
| --- | --- | --- |
| Aplicación móvil | Expo + React Native + TypeScript para Android e iOS | Solicitado por Marvin |
| Kotlin | Se retira del alcance | Solicitado por Marvin |
| Registro principal futuro de Optical Flow | API independiente en Laravel + PHP con base propia | Propuesta de arquitectura |
| Producción de Óptica Andina | Integración por API en una fase posterior | Solicitado por Marvin |
| Transporte | Una imagen por solicitud, inicialmente una solicitud en curso, agrupadas por lote lógico | Decisión inicial de implementación |
| Persistencia móvil | Guardar archivo y metadatos locales antes de intentar OCR o subida | Criterio funcional |
| Identidad | Nombre y cédula separados, conservando el texto OCR original | Solicitado por Marvin |
| Revisión | Toda propuesta OCR requiere revisión humana antes de vincularla a un paciente | Criterio de calidad |
| Paciente ausente | Crear una solicitud pendiente para resolver el caso | Política de alta por confirmar |
| Orden de varias páginas | En el prototipo cada imagen es una captura independiente. El agrupamiento manual pertenece a la fase de archivo | Supuesto explícito |
| Fecha histórica | Capturar y revisar la fecha de la orden cuando sea legible. Mantenerla vacía si se desconoce | Criterio de integridad |

## Entregas por fase

Las estimaciones son horas de trabajo efectivo de implementación y validación. Se ajustarán después de probar muestras representativas y los dispositivos de la óptica. No equivalen a fechas garantizadas ni incluyen esperas por cuentas, credenciales o revisión del negocio.

| Fase | Resultado verificable | Estimación inicial | Dependencias |
| --- | --- | --- | --- |
| 0. Prototipo Expo | Cámara continua, guardado local, importación de varias imágenes, OCR configurable, campos nombre/cédula y revisión | 12–20 h incluyendo pruebas en dispositivos | Expo, un Android y un iPhone de prueba |
| 1. API de Optical Flow | Laravel, autenticación, lotes, imágenes privadas, metadatos, auditoría, cola de OCR e idempotencia | 16–28 h | Contrato de API y servidor de prueba |
| 2. Piloto de archivo | Panel de revisión web, carga múltiple, búsquedas, páginas por orden y control de duplicados | 12–20 h | API funcional y muestra representativa |
| 3. Integración de pacientes | Buscar candidatos, confirmar coincidencia y asociar la orden a una atención histórica | 12–24 h | Acceso a la API y modelo de Óptica Andina |
| 4. Operación | Respaldos probados, control de acceso, métricas, recuperación y distribución interna móvil | 12–20 h | Piloto aceptado y políticas de conservación |

La entrega actual contiene el prototipo y la documentación. La compilación de Android/iOS, el rendimiento de cámara y la exactitud OCR deben validarse en dispositivos y con el servicio OCR activo. El Laravel definitivo y la conexión clínica corresponden a fases posteriores.

## Agentes y responsabilidades

Estos agentes representan áreas de trabajo con entregables y límites claros. Pueden ejecutarse por una misma persona o en paralelo cuando sus contratos estén fijados.

| Agente | Responsabilidad | Entregables | Evidencia de cierre |
| --- | --- | --- | --- |
| Producto y arquitectura | Convertir el flujo de recepción en requisitos, decidir estados y conservar acuerdos | Plan, arquitectura, decisiones y criterios | Cada requisito tiene una fase y una prueba |
| Expo móvil | Cámara continua, permisos, archivos locales, cola persistente, galería y revisión | App Android/iOS y guía de ejecución | Capturas consecutivas y recuperación tras cierre |
| OCR y calidad de imagen | Optimización, lectura, extracción de campos y tratamiento de fallos | Servicio OCR y evaluación con muestras | Nombre/cédula comparados con transcripción humana |
| Laravel y datos | API, usuarios, permisos, lotes, almacenamiento, cola de trabajos y auditoría | Migraciones, endpoints y pruebas de consistencia | Reintentar una subida genera un solo registro |
| Integración clínica | Consultar pacientes y crear adjuntos históricos tras confirmación | Adaptador a Óptica Andina y reconciliación | Mismo documento reenviado produce una sola asociación |
| QA y operación | Dispositivos, fallos de red, recuperación, empaquetado, despliegue y respaldos | Matriz de pruebas e instrucciones operativas | Restauración y recorrido completo demostrados |

Cada agente debe actualizar los documentos que describen su cambio y realizar un commit pequeño con el resultado. Las fotografías reales, cédulas, bases de datos, claves y tokens se conservan fuera del repositorio.

## Backlog con criterios de aceptación

| ID | Actividad | Criterio de aceptación | Fase |
| --- | --- | --- | --- |
| OF-001 | Permiso y activación de cámara | Al rechazar permisos se explica cómo habilitarlos y sigue disponible importar desde galería | 0 |
| OF-002 | Captura continua | Cada pulsación confirmada produce una captura distinta y la vista de cámara continúa abierta | 0 |
| OF-003 | Persistencia | Al cerrar y abrir la app siguen disponibles imagen, lote, estados y cambios guardados | 0 |
| OF-004 | Importación múltiple | Seleccionar varias imágenes crea elementos individuales en el mismo lote y muestra fallos por archivo | 0 |
| OF-005 | Imagen optimizada | Se conserva una copia persistente y se registra tamaño/resolución de la derivada enviada al OCR | 0 |
| OF-006 | OCR y campos | Texto íntegro y propuestas de nombre/cédula aparecen separados. Si falta un dato, queda vacío | 0 |
| OF-007 | Revisión | El operador corrige ambos campos, conserva OCR original y registra aprobación explícita | 0 |
| OF-008 | Recuperación del trabajo | Un fallo de red conserva la imagen y permite reintentar. Un cierre no convierte trabajo inconcluso en aprobado | 0–1 |
| OF-009 | Subida idempotente | Reenviar la misma clave de captura no duplica archivo lógico ni trabajo OCR | 1 |
| OF-010 | Autenticación | Cada solicitud se vincula al usuario y dispositivo con autorización para ese archivo | 1 |
| OF-011 | Auditoría | Corrección, aprobación y vinculación registran autor, instante y valores relevantes | 1 |
| OF-012 | Lotes web | El navegador acepta varias imágenes y presenta avance, éxito y error por archivo | 2 |
| OF-013 | Archivo consultable | Buscar por cédula normalizada o nombre devuelve registros revisados con fechas y miniaturas autorizadas | 2 |
| OF-014 | Duplicados | Hash idéntico genera advertencia y permite resolverla sin perder la procedencia | 2 |
| OF-015 | Varias páginas | Un operador puede reunir capturas de una misma orden y ordenar sus páginas | 2 |
| OF-016 | Paciente existente | Se muestran candidatos y el revisor confirma el ID del paciente antes de asociar la orden | 3 |
| OF-017 | Paciente ausente | El caso queda pendiente. El formulario de alta se implementa cuando se confirmen campos y reglas | 3 |
| OF-018 | Fecha histórica | La fecha de atención y la fecha de digitalización se guardan por separado | 3 |
| OF-019 | Reconciliación | Tras una interrupción se consulta el resultado remoto antes de volver a crear la asociación | 3 |
| OF-020 | Respaldo restaurable | Se recuperan una base y sus imágenes en un entorno de prueba | 4 |

## Cómo se decide entre subidas individuales y lotes

El lote identifica una sesión de trabajo, por ejemplo una caja o un mes del archivo. Cada imagen viaja en una solicitud independiente con su identificador estable. Se comienza con concurrencia uno para que la captura, la memoria y la recuperación sean fáciles de verificar. El usuario puede seguir tomando fotos mientras los elementos pendientes esperan en la cola.

Se medirá el tiempo medio y percentil 95 de subida/OCR, el peso de imagen, la tasa de fallos y el número de elementos pendientes. Si la red y el servidor lo permiten, se probará concurrencia dos. Un ZIP con cientos de imágenes exigiría repetir más trabajo tras un fallo y dificultaría mostrar el resultado de cada orden.

En Android/iOS el sistema operativo puede suspender la app. El prototipo reanuda el trabajo al volver a abrirla. La sincronización garantizada con la app cerrada requiere una fase específica de pruebas y mecanismos nativos de ejecución en segundo plano.

## Validación del piloto

1. Preparar inicialmente 30–50 muestras consentidas o anonimizadas que representen texto impreso, manuscrito, manchas, sombras, fechas y cédulas parcialmente legibles.
2. Transcribir nombre y cédula manualmente como referencia. Medir exactitud por campo y porcentaje que requiere corrección.
3. Probar captura consecutiva, importación múltiple, modo avión, cierre forzado, falta de espacio, doble pulsación y reintento tras timeout.
4. Medir tiempos en un Android y un iPhone reales. Un simulador sirve para navegación, pero la cámara requiere dispositivo compatible.
5. Revisar con recepción si el tiempo de corrección permite digitalizar más rápido que registrar manualmente.
6. Fijar objetivo de rendimiento después de esta medición. El archivo manuscrito puede requerir otro motor OCR o asistencia adicional.

## Git y documentación continua

El repositorio localizado para el proyecto es `CAMIZOCA/optical-flow`. Guardar código, migraciones, contratos, pruebas, documentación y únicamente muestras ficticias. Mantener un commit por cambio funcional revisable y un registro de decisiones para cambios de arquitectura. El trabajo de esta fase se prepara en una rama propia para revisar sus cambios.

El commit inicial de esta fase debe incluir el reemplazo de Kotlin por Expo, el plan, el contrato futuro, las dependencias declaradas y las limitaciones de pruebas. La conexión a un remoto Git requiere conocer el repositorio destino y disponer de permiso de escritura. El estado real del push se registrará en la entrega, sin asumirlo por haber creado un commit local.

Antes de incorporar una librería, anotar propósito, versión instalada, licencia y motivo. Los archivos de bloqueo generados por npm y Composer deben versionarse después de una instalación validada. Las versiones declaradas representan dependencias previstas hasta completar esa instalación.

## Preguntas pendientes para la fase clínica

- ¿Qué identificador y endpoint usa actualmente Óptica Andina para buscar pacientes y adjuntar órdenes?
- ¿Cuáles son los campos mínimos y la autorización necesaria para dar de alta un paciente?
- ¿Una orden corresponde siempre a una consulta o puede haber varias órdenes en una atención?
- ¿Cómo se registra una atención cuya fecha no es legible?
- ¿Quién puede corregir, aprobar, vincular y eliminar documentos?
- ¿Cuánto tiempo deben conservarse original, copia optimizada y copias móviles una vez confirmada la transferencia?
- ¿Qué volumen aproximado de órdenes y qué porcentaje de manuscritos hay en las cajas?

Estas preguntas delimitan la siguiente fase. La captura, el almacenamiento local y la revisión pueden desarrollarse con los criterios ya definidos.
