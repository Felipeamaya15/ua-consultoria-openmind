# SCRUM-487 — Credenciales externas

Fecha: 2026-10-30. Fuente: archivos reales de la rama `develop` (commit `fba6a48`). Alcance: Inventario, custodia, configuración y rotación.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-487 · Documentar configuración de credenciales externas |
| Backlog | BL-413 |
| Componente | Seguridad y servicios externos |
| Versión del código | Rama `develop`, commit `fba6a48` |
| Fecha | 30 de octubre de 2026 |
| Estado | Listo para validación |
| Relacionado | `EJECUCION_LOCAL.md` (variables de entorno, SCRUM-486) y los documentos SCRUM-482, SCRUM-484 y SCRUM-485 |

## 1. Propósito y alcance

Este documento reúne todas las credenciales y claves que usa el sistema: qué son, para qué sirven, dónde se configuran y se guardan, cuáles van cifradas, quién debe cambiarlas y cómo se rotan.

- **Incluye:** inventario, mecanismos de protección, configuración, generación y custodia de claves, rotación, respuesta ante una filtración y entrega a un emprendedor.
- **No incluye:** el resto de las variables de entorno (ver `EJECUCION_LOCAL.md`, sección 2).

> **Sin valores reales**
>
> Este documento no contiene ninguna credencial: solo nombres, ubicaciones y procedimientos. Ninguna clave debe pegarse en tickets, commits ni capturas de pantalla.

## 2. Inventario de credenciales

### 2.1 Credenciales del entorno (las gestiona quien opera el sistema)

| Credencial | Para qué | Dónde se configura |
| --- | --- | --- |
| `SECRET_KEY` (`DJANGO_SECRET_KEY` en `.env`) | Firma las sesiones y la protección CSRF de Django. Si falta `PAYMENT_CREDENTIALS_KEY`, también deriva la clave de cifrado | `.env` |
| `PAYMENT_CREDENTIALS_KEY` | Clave Fernet que cifra las credenciales de pago guardadas en la base | `.env` |
| `POSTGRES_PASSWORD` | Acceso a PostgreSQL | `.env` |
| `MONGO_PASSWORD` | Acceso a MongoDB | `.env` |
| `EMAIL_HOST_USER` y `EMAIL_HOST_PASSWORD` | Servidor SMTP del correo transaccional | `.env` (opcional) |
| `PICKUP_GOOGLE_GEOCODING_KEY` | Búsqueda de direcciones de retiro con Google Geocoding (activa con `PICKUP_GEOCODING_PROVIDER=google`) | `.env` (opcional) |

### 2.2 Credenciales por tienda (las ingresa el emprendedor en el panel)

| Servicio | Credenciales | Dónde se guardan | ¿Cifrada? |
| --- | --- | --- | --- |
| Transbank (Webpay) | Código de comercio, API key y ambiente (Integración o Producción) | Tabla `configuracion_transbank` | API key: sí |
| Mercado Pago | Public key, access token y ambiente (Sandbox o Producción) | Tabla `configuracion_mercadopago` | Access token: sí |
| PayPal | Client ID, client secret y ambiente (Sandbox o Live) | Tabla `configuracion_paypal` | Client secret: sí |
| Linkify | ID de cuenta (`idCuenta`) y clave privada (`clavePrivada`) | JSON `datos` de `configuracion_pago` | **No** |
| Transferencia bancaria | Banco, tipo y número de cuenta, RUT y nombre del titular y correo de confirmación | JSON de `configuracion_pago` y `configuracion_pagos` | **No** |

### 2.3 Identificadores públicos y servicios sin credenciales

| Elemento | Situación |
| --- | --- |
| ID de cliente de Google (inicio de sesión) | Público. Se define en `VITE_GOOGLE_CLIENT_ID` al compilar el frontend y por tienda en `google_client_id` (`configuracion_autenticacion`). El código no usa un client secret: valida al usuario con el token que entrega Google |
| Google Analytics y Meta Pixel | Identificadores públicos que se ingresan en el panel (SEO y analítica) y **no se guardan en el servidor**: quedan en el navegador |
| Chilexpress y Starken | **No tienen credenciales:** el código calcula las tarifas con una tabla interna por región y no llama a sus APIs |
| Token de sesión | Lo emite el backend al iniciar sesión (tabla `authtoken_token`) y el navegador lo guarda con la clave `token` |

## 3. Cómo se protegen

### 3.1 Variables de entorno

Las credenciales del entorno viven en el archivo `.env`, que **no se versiona**. `.env.example` solo trae marcadores `REEMPLAZAR_...`. Compose entrega las variables al backend.

### 3.2 Cifrado de columnas (Fernet)

- Tres columnas usan `EncryptedTextField`: `api_key` (Transbank), `client_secret` (PayPal) y `access_token` (Mercado Pago). Se guardan con el prefijo `enc::`.
- La clave es `PAYMENT_CREDENTIALS_KEY`. **Si está vacía**, el sistema deriva una clave de `SECRET_KEY` (SHA-256).
- Los valores ya cifrados no se cifran dos veces. Si la clave no coincide, la lectura falla con el error “No se pudo descifrar la credencial: PAYMENT_CREDENTIALS_KEY no coincide”.

### 3.3 Enmascarado y permisos

- Las respuestas de la API **no devuelven los valores**: muestran los secretos enmascarados (solo los últimos 4 caracteres) y, en la configuración general de pagos, únicamente los nombres de los campos (`configured_fields`).
- Solo el **propietario activo** de la tienda puede leer y guardar la configuración: los usuarios anónimos, los compradores y los propietarios de otra tienda reciben 401 o 403.
- Al guardar desde el panel, un valor enmascarado no sobrescribe el secreto existente.

> **Hallazgo**
>
> Las columnas JSON `configuracion_pago.datos` y `configuracion_pagos.metodos` guardan sus campos **sin cifrar**. La API los oculta, pero una consulta a la base o un respaldo los muestra. Hay que proteger el acceso a la base y a los respaldos; cifrar esos campos sería una mejora futura y no forma parte de este ticket. Además, el panel envía por `/api/auth/configuracion-pagos/` la configuración de los métodos, por lo que conviene comprobar qué contiene cada instalación (sección 9).

## 4. Cómo configurar cada credencial

El emprendedor inicia sesión como **propietario** y entra al panel (`/emprendedor`). Los métodos de pago se configuran en **Pagos** (`/emprendedor/pagos`).

1. Elegir el método de pago (Transbank, Mercado Pago, PayPal, Linkify o transferencia).
2. Ingresar los campos obligatorios y elegir el **ambiente de pruebas** mientras se valida.
3. Habilitar el método y pulsar guardar. El panel confirma el guardado y muestra el secreto enmascarado.
4. Cuando todo funcione, cambiar al ambiente de producción con las credenciales reales.

| Método | Campos obligatorios al habilitarlo |
| --- | --- |
| Transbank | `api_key` y `commerce_id` |
| Mercado Pago | `access_token` |
| PayPal | `client_id` y `client_secret` |
| Linkify | `api_key` según la validación del guardado; el flujo de pago lee `idCuenta` y `clavePrivada` |
| Transferencia | `bank_name`, `account_type`, `account_number`, `holder_rut`, `holder_name` y `confirmation_email` |

- Debe haber **al menos un método habilitado**; de lo contrario el guardado se rechaza.
- **Linkify:** el sistema expone `/api/pagos/linkify/notificacion/` y `/api/pagos/linkify/webhook/` para recibir las notificaciones, y verifica su firma con la clave privada. El código indica que la codificación exacta de la firma debe validarse con Linkify antes de salir a producción.
- **Inicio de sesión con Google:** el ID de cliente por tienda se define en el panel, en **Autenticación**.
- **Correo y geocodificación:** se configuran en el `.env` (sección 2.1) y requieren recrear el backend.

## 5. Generar y custodiar las claves

Con Docker disponible, estos comandos (de `EJECUCION_LOCAL.md`, sección 2.3) generan valores nuevos. **No los pegues en tickets, commits ni capturas.**

```powershell
# Valor para DJANGO_SECRET_KEY
docker compose run --rm --no-deps backend python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Valor para PAYMENT_CREDENTIALS_KEY
docker compose run --rm --no-deps backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

- Guardar las claves en un **administrador de contraseñas**, no en archivos compartidos.
- **Conservar `PAYMENT_CREDENTIALS_KEY`** entre actualizaciones: sin ella no se pueden descifrar las credenciales guardadas.
- Las variables `VITE_*` son públicas: no deben contener secretos.
- El respaldo de la base y la clave `PAYMENT_CREDENTIALS_KEY` se guardan por separado.

## 6. Cambio y rotación

| Qué cambiar | Cómo | Efecto |
| --- | --- | --- |
| Una credencial de pasarela | En el panel, ingresar el valor nuevo y guardar | Se cifra con la clave vigente; efecto inmediato |
| `SECRET_KEY` | Cambiarla en `.env` y recrear el backend | Invalida sesiones y firmas de Django. Con `PAYMENT_CREDENTIALS_KEY` definida no afecta el cifrado; con esa clave vacía, sí |
| `PAYMENT_CREDENTIALS_KEY` | Procedimiento de la sección 6.1 | Re-cifra las credenciales guardadas |
| Contraseña de PostgreSQL | `ALTER USER <usuario> WITH PASSWORD '<nueva>';` dentro de `psql` y luego actualizar `.env` y recrear el backend | Hay una breve interrupción entre ambos pasos |
| Contraseña de MongoDB | `db.getSiblingDB("admin").changeUserPassword("<usuario>", "<nueva>")` en `mongosh` y luego actualizar `.env` y recrear el backend | Igual que la anterior |
| SMTP o geocodificación | Actualizar en `.env` (y en el proveedor) y `docker compose up -d --force-recreate backend` | Efecto al reiniciar el backend |
| ID de cliente de Google | Actualizar `VITE_GOOGLE_CLIENT_ID` y recrear el frontend | Es un valor de compilación |

### 6.1 Rotar PAYMENT_CREDENTIALS_KEY

No existe un comando de rotación en el código. Si solo se cambia la clave en `.env`, las credenciales guardadas **dejan de poder leerse**. Este procedimiento las re-cifra con la clave nueva.

1. Programar una ventana de mantenimiento y **respaldar PostgreSQL** (documento SCRUM-484, sección 9).
2. Conservar la clave actual (`OLD_KEY`) y generar la nueva (`NEW_KEY`) con el comando de la sección 5.
3. Guardar el script de abajo como `backend/rotar_claves.py` (archivo temporal que no se sube a Git).
4. Ejecutarlo en PowerShell, desde la raíz del proyecto (reemplazar los valores entre `< >`).
5. Comprobar que informe `Credenciales re-cifradas: N`.
6. Cambiar `PAYMENT_CREDENTIALS_KEY` en `.env` por la clave nueva y recrear el backend.
7. Verificar en **Pagos** que los secretos aparecen enmascarados y hacer un pago de prueba en el ambiente de pruebas.
8. Eliminar `rotar_claves.py` y la clave antigua una vez confirmado.

```powershell
Get-Content backend\rotar_claves.py | docker compose exec -T -e OLD_KEY="<clave anterior>" -e NEW_KEY="<clave nueva>" backend python manage.py shell
```

Contenido de `rotar_claves.py`:

```python
# Re-cifra las credenciales de pago con una clave Fernet nueva.
# Uso, dentro del contenedor backend (ver el procedimiento del documento):
#   OLD_KEY=<clave anterior> NEW_KEY=<clave nueva> python manage.py shell < rotar_claves.py
import os
from cryptography.fernet import Fernet
from django.db import connection, transaction

PREFIJO = 'enc::'
COLUMNAS = [
    ('configuracion_transbank', 'id_configuracion', 'api_key'),
    ('configuracion_paypal', 'id_tienda', 'client_secret'),
    ('configuracion_mercadopago', 'id_tienda', 'access_token'),
]
anterior = Fernet(os.environ['OLD_KEY'].encode())
nueva = Fernet(os.environ['NEW_KEY'].encode())
cambiadas = 0
with transaction.atomic():
    with connection.cursor() as cursor:
        for tabla, pk, columna in COLUMNAS:
            cursor.execute(f'SELECT {pk}, {columna} FROM {tabla}')
            filas = cursor.fetchall()
            for clave_fila, valor in filas:
                if valor and valor.startswith(PREFIJO):
                    texto = anterior.decrypt(valor[len(PREFIJO):].encode())
                    cifrado = PREFIJO + nueva.encrypt(texto).decode()
                    cursor.execute(f'UPDATE {tabla} SET {columna} = %s WHERE {pk} = %s', [cifrado, clave_fila])
                    cambiadas += 1
print(f'Credenciales re-cifradas: {cambiadas}')
```

Si `PAYMENT_CREDENTIALS_KEY` estaba **vacía**, la clave anterior es la derivada de `SECRET_KEY`, que se obtiene así:

```python
import base64, hashlib
print(base64.urlsafe_b64encode(hashlib.sha256("<SECRET_KEY>".encode()).digest()).decode())
```

> **Probado con datos de prueba**
>
> El script se verificó en una base en memoria: re-cifró 2 credenciales, la clave nueva las descifra, la anterior ya no, y las columnas vacías quedan intactas. El procedimiento completo debe ensayarse en un entorno de prueba antes de aplicarse a datos reales.

## 7. Qué hacer ante una filtración

1. **Revocar o regenerar** la credencial en el proveedor (Transbank, Mercado Pago, PayPal, Linkify, Google o el servidor SMTP).
2. Ingresar la credencial nueva en el panel de **Pagos** (o en el `.env`, según corresponda).
3. Rotar `SECRET_KEY` y las contraseñas de las bases si hubo acceso al servidor o al `.env`.
4. Revisar los registros del backend y los movimientos en el proveedor para detectar uso indebido.
5. Si la clave llegó a Git, **cambiarla igualmente**: borrar el archivo no la elimina del historial.
6. Registrar lo ocurrido y avisar al propietario de la tienda.

## 8. Entrega de credenciales a un emprendedor

|  | Paso | Detalle |
| --- | --- | --- |
| [ ] | Crear un `.env` nuevo para la instalación | Con `SECRET_KEY` y `PAYMENT_CREDENTIALS_KEY` generadas de nuevo |
| [ ] | Definir contraseñas nuevas de PostgreSQL y MongoDB | No reutilizar las de pruebas |
| [ ] | El emprendedor ingresa sus propias credenciales de pasarela | Desde el panel de Pagos, con su cuenta de propietario |
| [ ] | El emprendedor cambia la contraseña de su cuenta | Al recibir el acceso |
| [ ] | Entregar el `.env` por un canal seguro | Y borrar las copias del equipo que desarrolló el sistema |
| [ ] | Quitar los accesos del equipo de desarrollo | Servidor, cuentas de servicios y repositorios privados |
| [ ] | Confirmar que ninguna clave quedó en Git, tickets ni capturas | Revisar el historial |

## 9. Verificación realizada

Ejecutada el 30 de octubre de 2026 sobre el commit `fba6a48`, con SQLite de prueba y las tablas creadas desde los modelos.

| Comprobación | Resultado |
| --- | --- |
| `apps.authentication.tests.test_payment_config_security` | 4 de 4 pruebas correctas: la API no expone los secretos y bloquea a anónimos, compradores y propietarios ajenos |
| `apps.core.test_credenciales_cifradas` | 8 de 8 pruebas correctas |
| Script de rotación de claves | Correcto con datos de prueba (sección 6.1) |
| Variables de entorno leídas fuera de `settings.py` | Solo `PICKUP_GEOCODING_PROVIDER` y `PICKUP_GOOGLE_GEOCODING_KEY` |
| Conexiones externas del código | Google (userinfo y geocodificación), PayPal (sandbox y live), Transbank (integración y producción), Mercado Pago y Linkify. Ninguna a Chilexpress ni Starken |

**Consultas para comprobar qué guarda cada instalación** (muestran solo nombres de campos, no valores; no se ejecutaron en este entorno):

```powershell
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT tienda_id, m.key AS metodo, jsonb_object_keys(m.value->'"'"'fields'"'"') AS campo FROM configuracion_pagos, jsonb_each(metodos) AS m;"'
```

## 10. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| “No se pudo descifrar la credencial: PAYMENT_CREDENTIALS_KEY no coincide” | La clave cambió o no es la que cifró los datos | Restaurar la clave anterior o aplicar la rotación de la sección 6.1 |
| “Faltan datos obligatorios para &lt;método&gt;” | Falta un campo al habilitar el método | Completar los campos de la sección 4 |
| “Debe existir al menos un metodo de pago habilitado” | Se guardó sin ningún método activo | Habilitar al menos uno |
| Los pagos no se confirman | Ambiente equivocado o credenciales de pruebas en producción | Revisar el ambiente y las credenciales del método |
| Linkify no notifica o la firma es inválida | Clave privada incorrecta o notificación mal configurada | Revisar la clave y validar la firma con Linkify |
| Se cerraron las sesiones | Se cambió `SECRET_KEY` | Es esperable; los usuarios inician sesión de nuevo |

## 11. Referencias

- `EJECUCION_LOCAL.md`: variables de entorno (2.2), generación de claves (2.3) y reglas de seguridad (2.4).
- `backend/apps/core/infrastructure/encryption.py` y `backend/apps/core/models.py`: cifrado y modelos de credenciales.
- `backend/apps/authentication/` (`application/use_cases.py`, `presentation/serializers.py`) y `backend/apps/core/presentation/checkout.py` (Linkify).
