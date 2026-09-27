from django.urls import path
from .views import RegisterAPIView, LoginAPIView, MeAPIView, GoogleLoginAPIView

urlpatterns = [
    path('register/', RegisterAPIView.as_view(), name='api_register'),
    path('login/', LoginAPIView.as_view(), name='api_login'),
    path('google/', GoogleLoginAPIView.as_view(), name='api_google_login'),
    path('me/', MeAPIView.as_view(), name='api_me'),
]