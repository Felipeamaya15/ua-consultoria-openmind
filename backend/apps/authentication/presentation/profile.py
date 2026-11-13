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
from apps.authentication.infrastructure.cookie_auth import ActiveSessionTokenAuthentication
from apps.authentication.infrastructure.models import UserProfile
from apps.core.domain.security_validators import (
    escape_xss,
    validate_strict_email,
    validate_strict_person_name,
    validate_strict_phone,
    validate_strict_postal_code,
)
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
    postal_code = serializers.CharField(max_length=12, allow_blank=True, required=False)

    def validate_first_name(self, value):
        try:
            return validate_strict_person_name(value, 'Nombre', allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_last_name(self, value):
        try:
            return validate_strict_person_name(value, 'Apellido', allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_email(self, value):
        try:
            cleaned = validate_strict_email(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        if get_user_model().objects.filter(email__iexact=cleaned).exclude(pk=self.context['user'].pk).exists():
            raise serializers.ValidationError('Este email ya está registrado.')
        return cleaned

    def validate_phone(self, value):
        try:
            return validate_strict_phone(value, allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_postal_code(self, value):
        try:
            return validate_strict_postal_code(value, allow_blank=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))


class PasswordSerializer(StrictSerializer):
    current_password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

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
    result = {
        'first_name': escape_xss(user.first_name or ''),
        'last_name': escape_xss(user.last_name or ''),
        'email': user.email,
        'phone': escape_xss(profile.phone or '') if profile else '',
    }
    if profile and profile.postal_code:
        result['postal_code'] = escape_xss(profile.postal_code)
    return result


class IsCustomer(BasePermission):
    message = 'El perfil de comprador no está disponible para administradores o propietarios de tienda.'

    def has_permission(self, request, view):
        from apps.core.models import Tienda
        user = request.user
        return (user.is_authenticated and not user.is_staff and not user.is_superuser
                and not Tienda.objects.del_propietario(user).exists())


class ProfileAPIView(APIView):
    serializer_class = ProfileSerializer
    authentication_classes = [ActiveSessionTokenAuthentication, TokenAuthentication]
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
        profile_defaults = {}
        if 'phone' in data:
            profile_defaults['phone'] = data.pop('phone')
        if 'postal_code' in data:
            profile_defaults['postal_code'] = data.pop('postal_code')
        if profile_defaults:
            UserProfile.objects.update_or_create(user=user, defaults=profile_defaults)
        for field, value in data.items():
            setattr(user, field, value)
        if data:
            user.save(update_fields=list(data))
        return success_response(data=profile_data(user), mensaje='Perfil guardado correctamente.')


class PasswordAPIView(APIView):
    authentication_classes = [ActiveSessionTokenAuthentication, TokenAuthentication]
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
