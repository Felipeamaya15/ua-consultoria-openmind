import re
from apps.core.domain.periodos import ZONA_COMERCIAL as ZONA

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.reports import consultar_informe
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import error_response, success_response



def leer_filtros(params):
    if set(params) - {'anio', 'mes', 'tienda_id', 'id_tienda'}:
        raise ValueError('Usa solamente año y mes para consultar el informe.')
    for key in ('anio', 'mes'):
        if len(params.getlist(key)) > 1:
            raise ValueError('No se permiten filtros repetidos.')
    hoy = timezone.localdate(timezone=ZONA)
    raw = params.get('anio', str(hoy.year))
    if not re.fullmatch(r'[0-9]{1,4}', raw) or not 1 <= int(raw) <= hoy.year:
        raise ValueError('Selecciona un año válido, hasta el año actual.')
    mes = params.get('mes')
    if mes is not None and (not re.fullmatch(r'[0-9]{1,2}', mes) or not 1 <= int(mes) <= 12):
        raise ValueError('Selecciona un mes entre 1 y 12, u omítelo para el año completo.')
    return int(raw), int(mes) if mes is not None else None


class InformeAPIView(APIView):
    permission_classes = [IsAuthenticated]
    pdf = False

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        try:
            anio, mes = leer_filtros(request.query_params)
        except ValueError as error:
            return error_response(str(error), 'PERIODO_INVALIDO')
        data = consultar_informe(tienda, anio, mes, ZONA)
        if self.pdf:
            from apps.core.infrastructure.report_pdf import generar_pdf
            response = HttpResponse(generar_pdf(data, timezone.localtime(timezone.now(), ZONA)), content_type='application/pdf')
            periodo = f'{anio:04d}' + (f'-{mes:02d}' if mes else '')
            response['Content-Disposition'] = f'attachment; filename="informe-ventas-pedidos-{periodo}.pdf"'
        else:
            response = success_response(data=data, mensaje='Informe obtenido correctamente.')
        response['Cache-Control'] = 'no-store'
        return response


class InformePDFAPIView(InformeAPIView):
    pdf = True
