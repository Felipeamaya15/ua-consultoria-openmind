from apps.landing.activity_replies import ActivityRepliesView, SendActivityReplyView
from django.urls import path
from apps.landing.views import ConfiguracionLandingAPIView, AparienciaBloquesAPIView, RedesSocialesAPIView
from apps.landing.media_views import MediaLibraryView, MediaResourceView, MediaImageView
from apps.landing.public_section_media import PublicSectionMediaView, PublicSectionImageView
from apps.landing.activity_views import ActivitySubmissionView, ActivityEnrollmentView, ActivityRequestsView, ActivityRequestView
from apps.landing.carrusel_views import (ImagenesCarruselLandingAPIView, ImagenCarruselLandingDetalleAPIView, OrdenImagenesCarruselLandingAPIView)

urlpatterns = [
    path('solicitudes-actividades/<uuid:pk>/respuestas/', ActivityRepliesView.as_view(), name='respuestas-actividad'),
    path('solicitudes-actividades/<uuid:pk>/respuestas/<uuid:reply_id>/enviar/', SendActivityReplyView.as_view(), name='enviar-respuesta-actividad'),
    path('actividades/<uuid:pk>/consultas/', ActivitySubmissionView.as_view(), name='consulta-actividad'),
    path('actividades/<uuid:pk>/inscripciones/', ActivityEnrollmentView.as_view(), name='inscripcion-actividad'),
    path('solicitudes-actividades/', ActivityRequestsView.as_view(), name='solicitudes-actividades'),
    path('solicitudes-actividades/<uuid:pk>/', ActivityRequestView.as_view(), name='gestion-solicitud-actividad'),
    path('multimedia-publica/', PublicSectionMediaView.as_view(), name='multimedia-secciones-publicadas'),
    path('multimedia-publica/<uuid:pk>/imagen/', PublicSectionImageView.as_view(), name='imagen-seccion-publicada'),
    path('biblioteca/', MediaLibraryView.as_view(), name='biblioteca-multimedia'),
    path('biblioteca/<uuid:pk>/', MediaResourceView.as_view(), name='recurso-multimedia'),
    path('biblioteca/<uuid:pk>/imagen/', MediaImageView.as_view(), name='imagen-biblioteca'),
    path('redes-sociales/', RedesSocialesAPIView.as_view(), name='redes-sociales'),
    path('apariencia/', AparienciaBloquesAPIView.as_view(), name='apariencia-bloques'),
    path("configuracion/", ConfiguracionLandingAPIView.as_view(), name="configuracion-landing"),
    path('carrusel/', ImagenesCarruselLandingAPIView.as_view(), name='imagenes-carrusel-landing'),
    path('carrusel/orden/', OrdenImagenesCarruselLandingAPIView.as_view(), name='orden-imagenes-carrusel'),
    path('carrusel/<uuid:pk>/', ImagenCarruselLandingDetalleAPIView.as_view(), name='detalle-imagen-carrusel'),
]
