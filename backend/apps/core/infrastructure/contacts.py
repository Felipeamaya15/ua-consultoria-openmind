"""Contactos operacionales derivados únicamente de pedidos de la tienda autorizada."""
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import CharField, Count, Max, Subquery, Value, Func, Q
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast, Coalesce, Lower, NullIf, Trim

from apps.core.domain import historial as reglas
from apps.core.domain.periodos import ZONA_COMERCIAL
from apps.core.infrastructure.commercial import validate_params
from apps.core.models import Pedido, ConsentimientoComercial

CONTACT_FILTERS = {'q', 'consentimiento', 'fecha_desde', 'fecha_hasta', 'pagina', 'tamano',
                   'tienda_id', 'id_tienda', 'formato', 'uso'}
MAX_CONTACTS = 50000
WHITESPACE = ' \t\r\n\v\f\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000'


def strip_email(expression):
    # PostgreSQL BTRIM con los mismos caracteres que str.strip; TRIM solo quita espacios ASCII.
    return Func(expression, Value(WHITESPACE), function='BTRIM', output_field=CharField())


def normalize_email(value):
    if not isinstance(value, str):
        return None
    email = value.strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        return None
    return email if len(email) <= 320 else None


def eligible_consents(store):
    """Criterio único para exportación comercial y preparación de campañas."""
    return ConsentimientoComercial.objects.filter(tienda=store, estado='autorizado', verificado=True,
        fecha_verificacion__isnull=False, fecha_autorizacion__isnull=False).exclude(version_texto='').exclude(referencia_evidencia='')


def contact_rows(store, params, *, marketing=False):
    validate_params(params, CONTACT_FILTERS)
    text = reglas.leer_busqueda(params)
    date_range = reglas.leer_rango(params)
    reglas.leer_pagina(params)
    state = params.get('consentimiento', 'todos')
    if state not in ('todos', 'autorizado', 'pendiente', 'retirado', 'sin_registro'):
        raise reglas.ParametroInvalido('Selecciona un consentimiento válido.', 'CONSENTIMIENTO_INVALIDO')
    email = Lower(strip_email(Coalesce(NullIf(strip_email('correo_contacto'), Value('')),
          NullIf(strip_email(Cast(KeyTextTransform('email', 'contacto'), CharField())), Value('')),
          'id_usuario__correo', Value(''), output_field=CharField())))
    evidence = ConsentimientoComercial.objects.filter(tienda=store)
    matching = evidence
    if state == 'autorizado':
        matching = matching.filter(estado='autorizado', verificado=True)
    elif state == 'pendiente':
        matching = matching.filter(Q(estado='pendiente') | Q(estado='autorizado', verificado=False))
    elif state == 'retirado':
        matching = matching.filter(estado='retirado')
    if marketing:
        matching = matching.filter(pk__in=eligible_consents(store).values('pk'))
    query = (Pedido.objects.filter(tienda=store).annotate(email_normalizado=email)
             .exclude(email_normalizado='').order_by().values('email_normalizado')
             .annotate(cantidad_pedidos=Count('pk'), ultimo_pedido=Max('fecha_creacion')))
    if text:
        query = query.filter(email_normalizado__icontains=text)
    if state == 'sin_registro':
        query = query.exclude(email_normalizado__in=Subquery(evidence.values('email')))
    elif state != 'todos':
        query = query.filter(email_normalizado__in=Subquery(matching.values('email')))
    if marketing:
        query = query.filter(email_normalizado__in=Subquery(matching.values('email')))
    start, end = date_range.limites()
    if start:
        query = query.filter(ultimo_pedido__gte=start)
    if end:
        query = query.filter(ultimo_pedido__lt=end)
    rows = []
    for row in query.order_by('email_normalizado').iterator(chunk_size=2000):
        email_value = normalize_email(row['email_normalizado'])
        if email_value:
            if len(rows) >= MAX_CONTACTS:
                raise reglas.ParametroInvalido('Reduce los filtros: máximo 50.000 contactos por consulta.', 'EXPORTACION_DEMASIADO_GRANDE')
            rows.append({'email': email_value, 'cantidad_pedidos': row['cantidad_pedidos'],
                         'ultimo_pedido': row['ultimo_pedido'].astimezone(ZONA_COMERCIAL).isoformat(),
                         'consentimiento': 'sin_registro', 'fecha_consentimiento': None})
    # Opt-ins from registration/preferences are contacts even without a purchase.
    # Order-date filters intentionally exclude contacts with no orders.
    if state != 'sin_registro' and not start and not end:
        seen = {row['email'] for row in rows}
        extras = matching.exclude(email__in=Subquery(Pedido.objects.filter(tienda=store)
            .annotate(email_normalizado=email).values('email_normalizado')))
        if text:
            extras = extras.filter(email__icontains=text)
        for record in extras.order_by('email').iterator(chunk_size=2000):
            if record.email not in seen:
                if len(rows) >= MAX_CONTACTS:
                    raise reglas.ParametroInvalido('Reduce los filtros: máximo 50.000 contactos por consulta.', 'EXPORTACION_DEMASIADO_GRANDE')
                rows.append({'email': record.email, 'cantidad_pedidos': 0, 'ultimo_pedido': None,
                             'consentimiento': 'sin_registro', 'fecha_consentimiento': None})
                seen.add(record.email)
    rows.sort(key=lambda row: row['email'])
    # Una consulta adicional para toda la página agregada; nunca una por contacto.
    records = {r['email']: r for r in evidence.filter(email__in=[r['email'] for r in rows]).values('email', 'estado', 'fecha_actualizacion', 'verificado')}
    for row in rows:
        if row['email'] in records:
            record = records[row['email']]
            row['consentimiento'] = 'pendiente' if record['estado'] == 'autorizado' and not record['verificado'] else record['estado']
            row['fecha_consentimiento'] = record['fecha_actualizacion'].isoformat()
    return rows
