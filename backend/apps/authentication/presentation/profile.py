from collections.abc import Mapping
import re
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.views import APIView
from apps.authentication.infrastructure.models import UserProfile
from apps.core.presentation.responses import success_response, error_response


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({field: 'Campo no permitido.' for field in sorted(unknown)})
        return super().to_internal_value(data)


class ProfileSerializer(StrictSerializer):
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    email = serializers.EmailField(max_length=254, required=False)
    phone = serializers.CharField(max_length=20, allow_blank=True, required=False)

    def validate_email(self, value):
        if get_user_model().objects.filter(email__iexact=value).exclude(pk=self.context['user'].pk).exists():
            raise serializers.ValidationError('Este email ya está registrado.')
        return value

    def validate_phone(self, value):
        if value and (not re.fullmatch(r'\+?[0-9 ()-]+', value) or not 7 <= len(re.sub(r'\D', '', value)) <= 15):
            raise serializers.ValidationError('Introduce un teléfono válido de 7 a 15 dígitos.')
        return value


class PasswordSerializer(StrictSerializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, data):
        user = self.context['user']
        if not user.check_password(data['current_password']):
            raise serializers.ValidationError({'current_password': 'La contraseña actual es incorrecta.'})
        try:
            validate_password(data['new_password'], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': exc.messages}) from exc
        return data


def profile_data(user):
    profile = UserProfile.objects.filter(user=user).first()
    return {'first_name': user.first_name, 'last_name': user.last_name,
            'email': user.email, 'phone': profile.phone or '' if profile else ''}


class IsCustomer(BasePermission):
    message = 'El perfil de comprador no está disponible para administradores o propietarios de tienda.'

    def has_permission(self, request, view):
        from apps.core.models import Tienda
        user = request.user
        return (user.is_authenticated and not user.is_staff and not user.is_superuser
                and not Tienda.objects.del_propietario(user).exists())


class ProfileAPIView(APIView):
    serializer_class = ProfileSerializer
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        return success_response(data=profile_data(request.user), mensaje='Perfil obtenido correctamente.')

    @transaction.atomic
    def patch(self, request):
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        serializer = self.serializer_class(data=request.data, context={'user': user}, partial=True)
        if not serializer.is_valid():
            return error_response('Datos de perfil inválidos.', 'PERFIL_INVALIDO', serializer.errors, status=400)
        data = dict(serializer.validated_data)
        if 'phone' in data:
            UserProfile.objects.update_or_create(user=user, defaults={'phone': data.pop('phone')})
        for field, value in data.items():
            setattr(user, field, value)
        if data:
            user.save(update_fields=list(data))
        return success_response(data=profile_data(user), mensaje='Perfil guardado correctamente.')


class PasswordAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated, IsCustomer]

    @transaction.atomic
    def post(self, request):
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        serializer = PasswordSerializer(data=request.data, context={'user': user})
        if not serializer.is_valid():
            return error_response('No se pudo cambiar la contraseña.', 'PASSWORD_INVALIDO', serializer.errors, status=400)
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return success_response(data={}, mensaje='Contraseña actualizada correctamente.')


# Comparte persistencia y validadores con el perfil comprador, con permisos propios.
from apps.authentication.permissions import IsStoreOwner


class EntrepreneurProfileSerializer(ProfileSerializer):
    def get_fields(self):
        return {'email': super().get_fields()['email']}


class EntrepreneurProfileAPIView(ProfileAPIView):
    permission_classes = [IsAuthenticated, IsStoreOwner]
    serializer_class = EntrepreneurProfileSerializer


class EntrepreneurPasswordAPIView(PasswordAPIView):
    permission_classes = [IsAuthenticated, IsStoreOwner]
