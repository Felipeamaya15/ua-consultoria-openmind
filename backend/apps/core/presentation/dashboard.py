"""Dashboard operativo (SCRUM-366 a 370, 372 y 373)."""
import re
from datetime import date, timedelta
from apps.core.domain.periodos import ZONA_COMERCIAL as ZONA

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.dashboard import consultar_dashboard
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import error_response, success_response



def leer_periodo(parametros):
    hoy = timezone.localdate(timezone=ZONA)
    for campo in ('periodo', 'fecha_desde', 'fecha_hasta'):
        if len(parametros.getlist(campo)) > 1:
            raise ValueError('No se permiten parámetros de período repetidos.')
    if 'fecha_desde' in parametros or 'fecha_hasta' in parametros:
        if 'periodo' in parametros:
            raise ValueError('Usa un período o un rango de fechas, no ambos.')
        valores = [parametros.get(campo, '') for campo in ('fecha_desde', 'fecha_hasta')]
        if not all(re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', valor) for valor in valores):
            raise ValueError('Indica ambas fechas con formato AAAA-MM-DD.')
        inicio, fin = (date.fromisoformat(valor) for valor in valores)
        if inicio > fin or fin > hoy or (fin - inicio).days >= 366:
            raise ValueError('El rango debe estar ordenado, no incluir fechas futuras y abarcar como máximo 366 días.')
        return inicio, fin
    periodo = parametros.get('periodo', '30')
    if periodo not in ('7', '30', 'year'):
        raise ValueError('El período debe ser 7, 30 o year.')
    inicio = date(hoy.year, 1, 1) if periodo == 'year' else hoy - timedelta(days=int(periodo) - 1)
    return inicio, hoy


class DashboardAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        try:
            inicio, fin = leer_periodo(request.query_params)
        except ValueError as error:
            return error_response(str(error), 'PERIODO_INVALIDO')
        response = success_response(
            data=consultar_dashboard(tienda, inicio, fin, ZONA),
            mensaje='Estadísticas obtenidas correctamente.',
        )
        response['Cache-Control'] = 'no-store'
        return response
