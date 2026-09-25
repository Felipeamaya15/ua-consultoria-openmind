from rest_framework import serializers


class PlantillaDisponibleSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    tags = serializers.ListField(
        child=serializers.CharField()
    )
    preview = serializers.CharField()