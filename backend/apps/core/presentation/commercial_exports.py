from datetime import date

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.domain import historial as reglas
from apps.core.domain.periodos import ZONA_COMERCIAL
from apps.core.infrastructure.commercial import order_query
from apps.core.infrastructure.commercial_exports import export_orders, export_contacts
from apps.core.infrastructure.contacts import contact_rows
from apps.core.infrastructure.reports import consultar_informe
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.reports import leer_filtros
from apps.core.presentation.responses import error_response, success_response


class PrivateReadView(APIView):
    permission_classes = [IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response


class InformeXLSXAPIView(PrivateReadView):
    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        try:
            year, month = leer_filtros(request.query_params)
            report = consultar_informe(tienda, year, month, ZONA_COMERCIAL)
            filters = {key: report[key] for key in ('fecha_desde', 'fecha_hasta')}
            query, _ = order_query(tienda, filters)
            period = f'{year:04d}' + (f'-{month:02d}' if month else '')
            return export_orders(tienda, query, 'Informe ' + period,
                                 f'informe-ventas-pedidos-{period}.xlsx', report=report, filters=filters)
        except (ValueError, reglas.ParametroInvalido) as error:
            return error_response(str(error), getattr(error, 'codigo', 'PERIODO_INVALIDO'))


class PedidosExportAPIView(PrivateReadView):
    sales = False

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        try:
            query, rango = order_query(tienda, request.query_params, sales=self.sales)
            series = None
            if self.sales:
                from django.db.models import Count, Sum
                from django.db.models.functions import TruncDay, TruncMonth
                grouping = reglas.leer_agrupacion(request.query_params, rango)
                truncate = TruncDay if grouping == 'dia' else TruncMonth
                pattern = '%Y-%m-%d' if grouping == 'dia' else '%Y-%m'
                series = [{'periodo': row['periodo'].strftime(pattern), 'cantidad_ventas': row['cantidad'],
                           'total_vendido': format(row['total'], '.2f')}
                          for row in query.order_by().annotate(periodo=truncate('fecha_creacion', tzinfo=ZONA_COMERCIAL))
                          .values('periodo').annotate(cantidad=Count('pk'), total=Sum('monto_total')).order_by('periodo')]
            kind = 'ventas' if self.sales else 'pedidos'
            return export_orders(tienda, query, 'Histórico de ' + kind,
                                 f'historico-{kind}-{timezone.now():%Y%m%d}.xlsx',
                                 series=series, filters=request.query_params)
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)


class VentasExportAPIView(PedidosExportAPIView):
    sales = True


class ContactosAPIView(PrivateReadView):
    export = False

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        try:
            params = request.query_params
            purpose = params.get('uso', 'operacional')
            file_format = params.get('formato', 'xlsx')
            if purpose not in ('operacional', 'marketing') or file_format not in ('xlsx', 'csv'):
                raise reglas.ParametroInvalido('Selecciona un uso y formato de exportación válidos.', 'EXPORTACION_INVALIDA')
            rows = contact_rows(tienda, params, marketing=purpose == 'marketing')
            if self.export:
                return export_contacts(tienda, rows, csv_format=file_format == 'csv', marketing=purpose == 'marketing')
            page = reglas.leer_pagina(params)
            return success_response(data=rows[page.inicio:page.fin], paginacion=page.metadatos(len(rows)),
                                    mensaje='Contactos operacionales. La compra no acredita consentimiento comercial.')
        except reglas.ParametroInvalido as error:
            return error_response(error.mensaje, error.codigo)


class ContactosExportAPIView(ContactosAPIView):
    export = True
