# SCRUM-516 — Validar mejoras y preparar backlog de continuidad

**Proyecto:** OpenMind — E-commerce  
**Fecha de revisión:** 6 de noviembre de 2026  
**Alcance:** mejoras de Página principal, Servicios y talleres, Biblioteca multimedia y Marketing/Difusión.  
**Estado del registro:** validación técnica aprobada en los comandos ejecutados; quedan comprobaciones manuales y de aceptación.

## 1. Objetivo

Consolidar los resultados verificables de las mejoras incorporadas, distinguir lo probado de lo pendiente y registrar el trabajo necesario para la continuidad del producto. Este registro **no reemplaza** la validación completa de las 17 historias de usuario (SCRUM-503) ni la validación final integral (SCRUM-504).

## 2. Mejoras revisadas y evidencia

| Mejora | Evidencia disponible | Estado |
|---|---|---|
| Archivado y desarchivado de **consultas** de servicios/talleres, sin archivar inscripciones | Pruebas del módulo Landing incluidas en las 128 pruebas aprobadas; previamente, 25 pruebas específicas de actividades aprobadas | Implementación y pruebas automatizadas aprobadas; verificar flujo manual completo |
| Guardado de Página principal con referencias antiguas a productos/categorías | Corrección aplicada y pruebas generales de Landing aprobadas | Falta prueba de regresión específica con una selección obsoleta |
| Indicadores de disponibilidad de apartados en cuatro plantillas | Revisión de `homeSections.ts`, `HomeSections.tsx` y compilación frontend | Compatibilidad declarada revisada; faltan pruebas visuales en las cuatro plantillas |
| URLs compartidas de publicaciones y reels de Instagram | `test_media_library.py`: **13/13**; `apps.landing`: **128/128** | Prueba automatizada aprobada; pendiente guardar/abrir una URL real antes rechazada |
| Difusión informativa de servicios y talleres (**SCRUM-515**) | Prueba manual con “Taller prueba”: imagen de galería recuperada, fecha y horario incorporados; publicación 1:1 exportada y observada | Flujo principal demostrado; pendiente comprobación exhaustiva de formatos y personalizaciones |
| Publicación con collage de hasta tres imágenes | Captura de composición con tres imágenes y descarga de PNG/JPG como imagen estática | Disponible en la vista previa; falta probar persistencia de la opción y diferentes formatos |
| Personalización del generador de publicaciones | Corrección posterior para volver a conectar controles existentes; compilación frontend aprobada | Realizar prueba manual de cada opción, especialmente con collage |

### Resultado de ejecución informado

- Backend: `python manage.py test apps.landing.test_media_library --noinput` → **13/13 OK**.
- Backend: `python manage.py test apps.landing --noinput` → **128/128 OK**.
- Backend: `python manage.py check` → sin problemas reportados.
- Frontend: `npm run typecheck` → **OK**.
- Frontend: `npm run build` → **OK**, 306 módulos transformados.
- Git: `git diff --check` → sin errores de espacios; advertencias LF/CRLF en Windows (no equivalen a fallos de la comprobación).

Estas verificaciones se ejecutaron en distintos momentos durante el desarrollo. No constituyen una prueba end-to-end integral ni garantizan que todas las variantes de diseño funcionen correctamente.

## 3. Backlog propuesto para continuidad

| Prioridad sugerida | Historia / tarea pendiente | Criterios de aceptación propuestos |
|---|---|---|
| Alta | **Regresión del guardado de Página principal** | Cambiar un campo no relacionado no falla por referencias antiguas sin modificar; agregar una referencia inválida sigue siendo rechazado; error identificado claramente |
| Alta | **Pruebas funcionales del generador de publicaciones** | En 1:1 y 9:16: plantilla, textos, paleta, imagen/logo, composición, zoom y botón responden; PNG/JPG exportados reflejan lo mostrado; sin recortes |
| Alta | **Prueba final de SCRUM-515** | Un taller/servicio visible aparece en Difusión; recupera su título, imágenes, fecha y horario; abre Publicaciones y permite exportar; uno cancelado/oculto no se difunde |
| Media | **Persistir opción «Una fotografía / Collage»** | El borrador recuerda el modo elegido al guardar, cerrar y reabrir sin interferir con productos |
| Media | **Revisar formato banner 16:9 con collage** | El diseño es legible, no muestra una pieza vacía y advierte con claridad si el contenido excede el espacio |
| Media | **Validar enlaces compartidos reales de Instagram** | Enlace real de tipo `/share/...` se guarda y abre; HTTPS y dominios no confiables siguen bloqueados; los casos automatizados se mantienen |
| Media | **Validar cuatro plantillas de Página principal** | Cada sección del sistema se muestra solo en las plantillas declaradas; secciones propias mantienen visibilidad, contenido y orden según configuración |
| Baja / evaluar alcance | **Exportación animada GIF o video** | Definir formato, duración, límite de tamaño y compatibilidad; no confundir vista previa animada con exportación PNG/JPG |
| Baja / evaluar alcance | **Mejoras de acabado visual y contenido responsivo** | Afinar jerarquía visual sin alterar opciones existentes; aprobar con diseño frontend y QA |

Las prioridades son una **propuesta para revisión con Product Owner y equipo**, no compromisos de un sprint ni historias Jira ya creadas.

## 4. Checklist de cierre

- [x] Reunir evidencia de las pruebas automatizadas ejecutadas.
- [x] Documentar el flujo de difusión informativa de talleres/servicios y el collage estático.
- [x] Identificar pendientes y proponer criterios de aceptación.
- [ ] Probar manualmente todas las opciones de personalización con collage en 1:1 y 9:16.
- [ ] Probar banner 16:9 y la exportación correspondiente.
- [ ] Validar un enlace real de Instagram que antes fallaba.
- [ ] Revisar archivado/desarchivado en interfaz sin afectar inscripciones.
- [ ] Crear o vincular las tareas de continuidad aprobadas en Jira.
- [ ] Confirmar resultados de SCRUM-503 y SCRUM-504 por separado.

## 5. Alcance del commit

Antes de registrar un commit, revisar `git status --short`, `git diff --stat` y `git diff --cached`. Incluir solo los archivos correspondientes a las mejoras que se desean entregar. No usar `git add .` si existen cambios ajenos o no revisados en la rama.
