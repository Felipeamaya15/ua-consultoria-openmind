from django.urls import path
from .views import (InstagramStateView, InstagramStartView, InstagramCallbackView,
    InstagramDisconnectView, InstagramRefreshView, InstagramPublicationsView,
    InstagramPublicationActionView, InstagramTemporaryImageView)

urlpatterns = [
    path('estado/', InstagramStateView.as_view(), name='instagram-estado'),
    path('oauth/iniciar/', InstagramStartView.as_view(), name='instagram-iniciar'),
    path('oauth/callback/', InstagramCallbackView.as_view(), name='instagram-callback'),
    path('desconectar/', InstagramDisconnectView.as_view(), name='instagram-desconectar'),
    path('renovar/', InstagramRefreshView.as_view(), name='instagram-renovar'),
    path('publicaciones/', InstagramPublicationsView.as_view(), name='instagram-publicaciones'),
    path('publicaciones/<uuid:pk>/confirmar/', InstagramPublicationActionView.as_view(), name='instagram-publicar'),
    path('publicaciones/<uuid:pk>/actualizar/', InstagramPublicationActionView.as_view(action='actualizar'), name='instagram-actualizar'),
    path('imagenes/<uuid:pk>/', InstagramTemporaryImageView.as_view(), name='instagram-imagen-temporal'),
]
