"""Resolve campaign references into the existing immutable JSON snapshot, without migrations."""
import base64
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.core.files.storage import default_storage
from rest_framework.exceptions import ValidationError
from apps.landing.models import ConfiguracionLanding, RecursoMultimedia
from apps.landing.campaign_rendering import safe_image, identity


def library_image(store, resource_id):
    try:
        UUID(str(resource_id))
    except (ValueError, TypeError):
        raise ValidationError('Selecciona una imagen válida de la biblioteca.') from None
    resource = RecursoMultimedia.objects.filter(pk=resource_id, tienda=store, activo=True, eliminado=False, tipo='imagen').select_related('archivo').first()
    if not resource:
        raise ValidationError('La imagen de biblioteca ya no está disponible en esta tienda.')
    if resource.archivo:
        try:
            with default_storage.open(resource.archivo.archivo.name, 'rb') as source:
                raw = source.read(2097153)
        except OSError:
            raise ValidationError('No se pudo recuperar la imagen. Elige otro recurso.') from None
        if len(raw) > 2097152:
            raise ValidationError('La imagen excede el tamaño permitido para campañas.')
        value = f'data:{resource.archivo.mime};base64,' + base64.b64encode(raw).decode()
    else:
        value = resource.url
    result = safe_image(value, identity(store)['base'])
    if not result:
        raise ValidationError('La biblioteca no contiene una imagen compatible.')
    return result


def money(value):
    try:
        amount = Decimal(str(value))
        return amount if amount.is_finite() and amount >= 0 else None
    except (InvalidOperation, TypeError, ValueError):
        return None


def content_snapshot(store, selection, previous):
    if selection is None:
        return None
    if not isinstance(selection, dict) or set(selection) != {'kind', 'id', 'skus', 'images'}:
        raise ValidationError('La selección de contenido no es válida.')
    kind, pk, skus, indices = (selection[key] for key in ('kind', 'id', 'skus', 'images'))
    if kind not in ('product', 'section') or not isinstance(pk, str):
        raise ValidationError('Selecciona un producto, servicio o taller publicado.')
    if not isinstance(skus, list) or len(skus) > 100 or any(not isinstance(sku, str) or len(sku) > 100 for sku in skus) or len(set(skus)) != len(skus):
        raise ValidationError('La selección de variantes no es válida.')
    if not isinstance(indices, list) or len(indices) > 6 or any(type(index) is not int or index < 0 for index in indices) or len(set(indices)) != len(indices):
        raise ValidationError('Selecciona hasta seis imágenes disponibles.')
    if previous.get('seleccion') == selection:
        return previous
    brand = identity(store)
    if kind == 'product':
        import re
        from pymongo.errors import PyMongoError
        from apps.catalog.infrastructure.repositories import ProductRepository
        if not re.fullmatch(r'[a-fA-F0-9]{24}', pk):
            raise ValidationError('El producto no es válido.')
        try:
            product = ProductRepository().get_admin_product(str(store.pk), pk)
        except PyMongoError:
            raise ValidationError('No se pudo consultar el catálogo. El borrador se conserva.') from None
        if not product or str(product.get('tienda_id')) != str(store.pk) or not product.get('activo'):
            raise ValidationError('El producto ya no está publicado en esta tienda.')
        variants = []
        for variant in product.get('variantes', []):
            price, offer = money(variant.get('precio')), money(variant.get('precio_oferta'))
            stock = variant.get('stock', 0)
            if variant.get('activo') is False or variant.get('es_activa') is False or not isinstance(stock, int) or stock <= 0 or price is None:
                continue
            if variant.get('precio_oferta') is not None and (offer is None or offer >= price):
                continue
            variants.append((variant, offer if offer is not None else price))
        chosen = [(v, p) for v, p in variants if not skus or v.get('sku') in skus]
        if not chosen or any(sku not in [v.get('sku') for v, _ in chosen] for sku in skus):
            raise ValidationError('Las variantes seleccionadas ya no están disponibles.')
        images = list(product.get('imagenes', []))
        for variant, _ in variants:
            images.extend(variant.get('imagenes') or [])
            if variant.get('imagen'):
                images.append(variant['imagen'])
        prices = [price for _, price in chosen]
        snapshot = {'id': pk, 'tipo': 'producto', 'nombre': product.get('nombre', ''), 'descripcion': product.get('descripcion', ''),
            'precio': str(min(prices)), 'desde': len(set(prices)) > 1,
            'url': brand['base'] + '/producto/' + (product.get('slug') or pk),
            'variantes': [{'sku': v.get('sku'), 'precio': str(p), 'atributos': v.get('atributos_variante', [])} for v, p in chosen]}
    else:
        try:
            UUID(pk)
        except ValueError:
            raise ValidationError('La sección no es válida.') from None
        if skus:
            raise ValidationError('Esta sección no tiene variantes de catálogo.')
        config = ConfiguracionLanding.objects.filter(tienda=store).first()
        block = next((b for b in config.contenido.get('bloques', []) if b.get('id') == pk), None) if config else None
        if not block or not block.get('visible') or (block.get('actividad') or {}).get('estado') == 'cancelada':
            raise ValidationError('El servicio o taller ya no está publicado.')
        elements = [item for item in block.get('componentes', []) if item.get('visible')]
        title = next((item.get('texto') for item in elements if item['tipo'] in ('titulo', 'nombre') and item.get('texto')), block.get('titulo', ''))
        description = '\n\n'.join(item.get('texto', '') for item in elements if item['tipo'] in ('texto', 'informacion', 'duracion', 'caracteristicas', 'requisitos', 'condiciones')) or block.get('texto', '')
        for item in elements:
            if item['tipo'] == 'fecha':
                description += '\nFecha: ' + item.get('fecha', '')
            if item['tipo'] == 'horario':
                description += '\nHorario: ' + item.get('inicio', '') + ' ' + item.get('termino', '')
            if item['tipo'] == 'modalidad':
                description += '\nModalidad: ' + item.get('modalidad', '')
        images = [image.get('src') for image in block.get('imagenes', [])]
        images.extend(image.get('src') for item in elements for image in item.get('imagenes', []))
        for item in elements:
            if item['tipo'] == 'biblioteca':
                resource = RecursoMultimedia.objects.filter(pk=item.get('recurso_id'), tienda=store, activo=True, eliminado=False, tipo='imagen').first()
                if resource:
                    images.append(('library:' + str(resource.pk)) if resource.archivo else resource.url)
        price = next((money(item.get('importe')) for item in elements if item['tipo'] == 'precio'), None)
        if (block.get('actividad') or {}).get('gratuito'):
            price = Decimal(0)
        snapshot = {'id': pk, 'tipo': 'seccion', 'nombre': title, 'descripcion': description,
            'precio': str(price) if price is not None else '', 'url': brand['base'] + '#seccion-' + pk}
    images = list(dict.fromkeys(image for image in images if isinstance(image, str) and image.strip()))
    if any(index >= len(images) for index in indices):
        raise ValidationError('Una imagen seleccionada ya no está disponible. Actualiza el contenido.')
    selected_images = []
    for index in indices:
        value = images[index]
        image = library_image(store, value[8:]) if value.startswith('library:') else safe_image(value, brand['base'])
        if not image:
            raise ValidationError('Una imagen seleccionada no es compatible. Selecciona otra.')
        selected_images.append(image)
    snapshot.update(imagenes=selected_images, imagen=selected_images[0] if selected_images else '', seleccion=selection)
    return snapshot
