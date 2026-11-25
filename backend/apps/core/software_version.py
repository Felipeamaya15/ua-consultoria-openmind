"""Dominio y lógica de negocio para la consulta de la versión vigente del software."""

import django
from django.conf import settings

SOFTWARE_NAME = "OpenMind E-Commerce"
SOFTWARE_VERSION = "1.0.0"
SOFTWARE_RELEASE_DATE = "2026-10-16"
SOFTWARE_STATE = "vigente"
SOFTWARE_PLATFORM = "Universidad Autónoma de Chile"
SOFTWARE_API_VERSION = "v1"


def get_software_version_info() -> dict:
    """Implementa la consulta de la versión vigente del software.

    Retorna la información canónica de la versión actualmente en vigor en la plataforma,
    su fecha de vigencia, estado operativo y metadatos del entorno.
    """
    ambiente = "development" if getattr(settings, "DEBUG", False) else "production"

    return {
        "sistema": SOFTWARE_NAME,
        "nombre": SOFTWARE_NAME,
        "version": SOFTWARE_VERSION,
        "version_vigente": SOFTWARE_VERSION,
        "fecha_vigencia": SOFTWARE_RELEASE_DATE,
        "fecha_lanzamiento": SOFTWARE_RELEASE_DATE,
        "estado": SOFTWARE_STATE,
        "vigente": True,
        "plataforma": SOFTWARE_PLATFORM,
        "ambiente": ambiente,
        "api_version": SOFTWARE_API_VERSION,
        "detalles": {
            "backend": f"Django {django.get_version()}",
            "arquitectura": "REST API + Microservicios Modulares",
            "compatibilidad": "1.0.0",
            "soporte": "soporte@uautonoma.cl",
            "institucion": SOFTWARE_PLATFORM,
        },
    }
