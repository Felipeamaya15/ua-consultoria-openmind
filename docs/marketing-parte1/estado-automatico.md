# Marketing Parte 1 — puerta de verificación de Parte 2

Ejecución: 16/10/2026. Rama comprobada: feature/mejoras-informes-configuracion.

## IMPLEMENTADO

Se leyó el código vigente de Marketing, sus dos suites frontend, la prueba backend y el informe técnico. No existe automatizacion/prompt-marketing-parte1.txt. Se contrastaron ProductoAdminDetailView, resolver_tienda y ProductRepository.list_by_store: propietario activo obligatorio y filtro servidor por tienda; el enlace contextual solo preselecciona dentro de los datos autorizados. Se conservan fuentes reales de nombre/logo, variantes, ofertas y paleta. No hay promociones locales/cupones convertidos en campañas.

Único ajuste de esta puerta: marketing-browser.cjs admite MARKETING_EVIDENCE_DIR y separa las fixtures de la salida para conservar íntegra la evidencia anterior.

## VALIDADO

Todos los registros siguientes se generaron en esta ejecución, dentro de verificacion-parte2/; código de salida final 0:

| Comando | Evidencia y resultado |
| --- | --- |
| node frontend/tests/marketing.cjs | unit.txt, 11 aprobadas |
| npm run build (frontend) | build.txt, TypeScript y Vite aprobados; aviso preexistente de bundle >500 kB |
| npm run test:reports | reports.txt, 6 aprobadas |
| npm run test:analytics | analytics.txt, aprobado, incluye checkout/retiro |
| npm run test:dashboard | dashboard.txt, 8 + 23 aprobadas |
| npm run test:visual | visual.txt, 47 aprobadas |
| npm run test:editor-ux | editor.txt, 15 + 58 + 6 aprobadas |
| docker exec django_backend python scripts/test_develop_integration.py apps.catalog.test_marketing_sources | mongo-source.txt, 5 aprobadas con Mongo real temporal y SQLite en memoria |
| docker exec django_backend python scripts/test_reports_postgres.py | postgres-reintento.txt, 57 aprobadas con PostgreSQL real temporal |
| node tests/marketing-browser.cjs (frontend, Edge) | browser.txt: 375/768/1440 px, 3 formatos, estados, variantes, ofertas, teclado, errores de página, PDF/configuración/promociones; capturas nuevas en capturas/ |

La primera ejecución PostgreSQL terminó con código 1 por falta de pypdf en el contenedor (postgres.txt). Se instaló requirements-test.txt ya existente (dependencias-test.txt, código 0) y se repitió con éxito. No se ocultó el intento fallido. Navegador: aplicación real con API interceptada y recursos QA, sin escrituras comerciales; los permisos/lecturas se validaron por separado con Mongo real. Se revisó visualmente la captura nueva banner-375.png.

Veredicto de puerta: **Parte 1 completa y validada para continuar a Parte 2**. No se detectaron defectos críticos/importantes. Las limitaciones originales de Parte 1 (campañas sin fuente, título muy extenso truncado con leyenda completa, preview sin exportación) están documentadas y no se confunden con prestaciones implementadas. La Parte 2 abordará ajuste de texto sin recortes.

## PENDIENTE

Aceptación humana con catálogo/logo del emprendedor. Campañas generales, exportación, persistencia y redes pertenecen a etapas posteriores. No se ejecutaron pruebas de cobro ni aceptación con datos comerciales. Las pruebas focalizadas SQLite de 147 casos del cierre previo no se declaran reejecutadas aquí.

## BLOQUEADO

Ningún bloqueo vigente de la puerta. Docker/Mongo/PostgreSQL y Edge estuvieron disponibles. Git se utilizó exclusivamente para lectura; no se cambió de rama ni se descartaron archivos.
