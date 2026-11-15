# Imagen del backend (Django) para producción. Se construye desde la raíz del proyecto.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings_produccion

WORKDIR /app

# Dependencias (Gunicorn queda fijado aquí para no tocar requirements.txt).
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn==26.2.0

# Código del backend y los archivos propios de producción.
COPY backend/ /app/
COPY deploy/settings_produccion.py /app/config/settings_produccion.py
COPY deploy/urls_produccion.py /app/config/urls_produccion.py
COPY deploy/healthcheck.py /healthcheck.py
COPY deploy/entrypoint.sh /entrypoint.sh

# Usuario sin privilegios "app". El arranque (entrypoint.sh) entra como administrador solo para corregir
# los permisos de los volúmenes y enseguida pasa a correr como "app".
RUN chmod +x /entrypoint.sh \
 && useradd --create-home --uid 1000 app \
 && mkdir -p /app/media /app/staticfiles \
 && chown -R app:app /app/media /app/staticfiles

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
