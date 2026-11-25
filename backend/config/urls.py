from xml.sax.saxutils import escape
from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, include
from django.conf import settings
from config.media import media_urlpatterns

from apps.catalog.presentation.views import (
    ProductVariantsView,
    VariantPurchaseView,
)


def sitemap_xml_view(request):
    host = request.get_host()
    scheme = 'https' if request.is_secure() or not settings.DEBUG else request.scheme
    base_url = escape(f'{scheme}://{host}')
    xml_content = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        '  <url>\n'
        f'    <loc>{base_url}/</loc>\n'
        '    <changefreq>daily</changefreq>\n'
        '    <priority>1.0</priority>\n'
        '  </url>\n'
        '  <url>\n'
        f'    <loc>{base_url}/catalogo</loc>\n'
        '    <changefreq>daily</changefreq>\n'
        '    <priority>0.8</priority>\n'
        '  </url>\n'
        '</urlset>\n'
    )
    return HttpResponse(xml_content, content_type='application/xml; charset=utf-8')


urlpatterns = [
    path('sitemap.xml', sitemap_xml_view, name='sitemap-xml'),
    path('api/sitemap.xml', sitemap_xml_view, name='api-sitemap-xml'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/catalog/', include('apps.catalog.urls')),
    path('api/', include('apps.core.urls')),
    path('api/visual-config/', include('apps.visual_config.urls')),
    path('api/landing/', include('apps.landing.urls')),
    path('api/instagram/', include('apps.instagram.urls')),

    path(
        'api/productos/<str:id_producto>/variantes/',
        ProductVariantsView.as_view(),
        name='qa-variantes'
    ),
    path(
        'api/productos/<str:id_producto>/variantes/<str:sku>/',
        ProductVariantsView.as_view(),
        name='qa-variantes-sku'
    ),
    path(
        'api/productos/<str:id_producto>/variantes/<str:sku>/comprar/',
        VariantPurchaseView.as_view(),
        name='qa-variante-comprar'
    ),
    path(
        'api/productos/<str:id_producto>/variantes/<str:sku>/compra/',
        VariantPurchaseView.as_view(),
        name='qa-variante-compra'
    ),

    path("api/logistica/", include("apps.shipping.presentation.urls")),
]

if settings.DEBUG:
    urlpatterns += media_urlpatterns()
