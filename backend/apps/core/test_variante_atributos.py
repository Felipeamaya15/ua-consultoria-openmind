from django.test import SimpleTestCase
from rest_framework import serializers

from apps.core.presentation.serializers import VarianteProductoSerializer


class VarianteProductoAtributosTests(SimpleTestCase):
    def setUp(self):
        self.serializer = VarianteProductoSerializer()

    def test_acepta_atributos_dinamicos_validos(self):
        atributos = {
            "talla": "M",
            "color": "Negro",
        }

        resultado = self.serializer.validate_atributos(atributos)

        self.assertEqual(
            resultado,
            {
                "talla": "M",
                "color": "Negro",
            },
        )

    def test_acepta_atributos_de_otro_rubro(self):
        atributos = {
            "voltaje": 220,
            "enchufe": "Tipo C",
        }

        resultado = self.serializer.validate_atributos(atributos)

        self.assertEqual(
            resultado,
            {
                "voltaje": 220,
                "enchufe": "Tipo C",
            },
        )

    def test_rechaza_atributos_vacios(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos({})

    def test_rechaza_nombre_de_atributo_vacio(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos(
                {
                    "   ": "M",
                }
            )

    def test_rechaza_valor_vacio(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos(
                {
                    "talla": "   ",
                }
            )

    def test_rechaza_valor_nulo(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos(
                {
                    "talla": None,
                }
            )

    def test_rechaza_lista_como_valor_de_variante(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos(
                {
                    "talla": ["S", "M", "L"],
                }
            )

    def test_rechaza_objeto_anidado_como_valor(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate_atributos(
                {
                    "medida": {
                        "ancho": 10,
                        "alto": 20,
                    },
                }
            )

    def test_rechaza_creacion_sin_atributos(self):
        with self.assertRaises(serializers.ValidationError):
            self.serializer.validate(
                {
                    "sku": "VAR-001",
                    "precio": "1000.00",
                    "stock": 5,
                    "es_activa": True,
                }
            )

    def test_limpia_espacios_en_claves_y_valores(self):
        resultado = self.serializer.validate_atributos(
            {
                " talla ": " M ",
            }
        )

        self.assertEqual(
            resultado,
            {
                "talla": "M",
            },
        )