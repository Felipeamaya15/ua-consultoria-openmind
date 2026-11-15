# Revisión previa a la integración manual

No se realizó ninguna operación de staging, commit, push, pull, merge, rebase, reset, stash, clean, cambios de rama o PR. Estas tareas siguen exclusivamente a cargo de la usuaria.

## Comparación remota

En una sesión anterior se actualizó `origin` mediante fetch. Esa revisión encontró `origin/develop` en `08fb9c4`, doce commits por delante del HEAD local `72a46ee`. No se volvió a actualizar el remoto durante los últimos ajustes funcionales. Incluye cambios de otros integrantes en diseño, acceso de clientes, productos, pagos y tipo de cambio; no se copiaron ni se reemplazaron desde esta tarea.

Archivos con cambios locales y remotos que necesitan conciliación cuidadosa:

| Archivo | Trabajo que debe conservarse |
|---|---|
| `.env.example` | Variables de correo SCRUM-522 y nuevas variables remotas de Banco Central |
| `backend/config/settings.py` | Transporte/límites de correo; políticas remotas de sesión administrativa/cliente y tipo de cambio |
| `docker-compose.yml` | Variables de correo y configuración remota del Banco Central |
| `frontend/src/features/auth/services/authService.ts` | Manejo local seguro de errores y cambios remotos de autenticación/sesión |
| `frontend/src/features/storefront/pages/Login.tsx` | Avances locales de autenticación y rediseño/cambios remotos de acceso |
| `frontend/tests/auth-security.cjs` | Mantener la cobertura de ambas líneas de trabajo; no elegir una versión completa a ciegas |

Esto identifica coincidencias de archivos y riesgos, no una resolución de conflictos comprobada mediante integración. No se ejecutó una integración de prueba, ni se preparó un índice alternativo. La migración remota `core.0036_tipocambioguardado` corresponde al trabajo remoto y deberá revisarse en el plan que exista **después** de integrar; no se aplicó en esta rama.

El ajuste final añade `core.0036_autorizacion_correo_y_verificacion`, dependiente de `0035` y validada únicamente en QA. La habitual sigue pendiente. Después de la integración manual habrá que conciliar ambas hojas del grafo de core; no aplicar una rama de migraciones a ciegas. Los hooks de autenticación solo registran verificación de correo que Google ya acreditó y la invalidan al cambiar dirección; conservar también los cambios remotos de autenticación al revisar esos archivos.

## Material privado

El origen remoto rastrea `backup_mongodb.archive`, de 1.549.093 bytes. Revisar ese archivo con el equipo antes de la integración. La regla `*.archive` evita nuevas incorporaciones accidentales pero no excluye un archivo ya rastreado ni borra su historia. No se extrajo su contenido.

Los respaldos PostgreSQL y de archivos, resultados extensos, credenciales de entorno y la fixture autenticada Postman permanecen fuera de Git. El escaneo de patrones de secretos de los cambios locales no encontró claves privadas ni formatos reconocibles de secretos Google, GitHub o AWS. Revisar también manualmente el diff completo.

## Propuesta de agrupación de commits — solo para revisión

1. **Correos y campañas, backend:** transporte autorizado, conversaciones, cola, consentimiento/bajas, registro, migraciones y pruebas backend correspondientes. Título propuesto: `feat(SCRUM-522): completar correo autorizado y campañas persistentes`.
2. **Panel y pruebas de interfaz:** Gmail únicamente en Página principal → Negocio, resumen en Campañas, preferencia propia verificada, borradores/campañas, confirmación e historial. `Emails.tsx` se conserva idéntico al original. Título: `feat(SCRUM-522): centralizar correo autorizado en Negocio y completar preferencias`.
3. **WebM:** conservación de formato, MIME y límites del procesamiento, conservando pruebas originales. Título: `fix(multimedia): conservar formato y MIME de videos WebM`.
4. **Obsidian y ruta CSS:** movimiento de la regla independiente, sin rediseño, y ruta corregida previamente autorizada. Título: `fix(storefront): conservar hero y delimitar estilos de Obsidian`.
5. **Documentación y QA:** informe, procedimiento, colección, fixture y prueba E2E, resultados sintéticos y reglas de exclusión. Título: `docs(SCRUM-522): documentar validación y preparación de integración`.

Los avances anteriores de autenticación, carruseles, personalización y diseño, así como ediciones concurrentes de Minimal, deben recibir su revisión y agrupación propia. No se absorbieron como si fueran cambios exclusivos de SCRUM-522. La corrección de la fixture de autenticación de catálogo conserva todas sus aserciones y debe acompañar las pruebas de seguridad correspondientes.

## Condiciones antes del merge manual

- Backend integral aprobado. Landing 0011/0012 ya estaban autorizadas/aplicadas; la nueva core 0036 requiere respaldo actualizado y autorización antes de aplicarse a la habitual.
- Revisar los fallos del lanzamiento histórico global de frontend; el resultado de SCRUM-522 no certifica que ese conjunto completo esté aprobado.
- Conservar el trabajo remoto nuevo y las ediciones concurrentes locales.
- Revisar los seis archivos coincidentes y el respaldo rastreado remoto.
- Confirmar que los artefactos sintéticos que se decida compartir no incluyan datos privados ni entornos autenticados.
- Repetir build/pruebas y revisar el plan de migraciones sobre el resultado que la usuaria integre manualmente.
