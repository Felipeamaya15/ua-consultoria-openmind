from django.urls import path

from apps.landing.views import ConfiguracionLandingAPIView, AparienciaBloquesAPIView, RedesSocialesAPIView
from apps.landing.media_views import MediaLibraryView, MediaResourceView, MediaImageView
from apps.landing.public_section_media import PublicSectionMediaView, PublicSectionImageView


urlpatterns = [
    path('multimedia-publica/', PublicSectionMediaView.as_view(), name='multimedia-secciones-publicadas'),
    path('multimedia-publica/<uuid:pk>/imagen/', PublicSectionImageView.as_view(), name='imagen-seccion-publicada'),
    path('biblioteca/', MediaLibraryView.as_view(), name='biblioteca-multimedia'),
    path('biblioteca/<uuid:pk>/', MediaResourceView.as_view(), name='recurso-multimedia'),
    path('biblioteca/<uuid:pk>/imagen/', MediaImageView.as_view(), name='imagen-biblioteca'),
    path('redes-sociales/', RedesSocialesAPIView.as_view(), name='redes-sociales'),
    path('apariencia/', AparienciaBloquesAPIView.as_view(), name='apariencia-bloques'),
    path(
        "configuracion/",
        ConfiguracionLandingAPIView.as_view(),
        name="configuracion-landing",
    ),
]
