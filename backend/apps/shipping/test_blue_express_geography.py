from copy import deepcopy

from django.test import SimpleTestCase

from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
)
from apps.shipping.infrastructure.blue_express.geography import (
    BlueExpressDestinationError,
    parse_geography,
    resolve_destination,
)


PAYLOAD = {
    "status": True,
    "data": [{
        "name": "CHILE",
        "code": "CL",
        "states": [{
            "name": "Metropolitana de Santiago",
            "code": 13,
            "ciudades": [{
                "name": "PROVIDENCIA",
                "code": 13123,
                "districts": [{
                    "name": "PROVIDENCIA",
                    "code": "PRO",
                }],
            }],
        }],
    }],
}


class BlueExpressGeographyTests(SimpleTestCase):
    def setUp(self):
        self.regions = parse_geography(deepcopy(PAYLOAD))

    def resolve(self, **changes):
        destination = {
            "region_code": 13,
            "commune_code": 13123,
            "district_code": "PRO",
        }
        destination.update(changes)
        return resolve_destination(self.regions, **destination)

    def test_resuelve_providencia(self):
        destination = self.resolve()

        self.assertEqual(destination, {
            "region_code": 13,
            "region_name": "Metropolitana de Santiago",
            "commune_code": 13123,
            "commune_name": "PROVIDENCIA",
            "district_code": "PRO",
            "district_name": "PROVIDENCIA",
        })

    def test_rechaza_region_inexistente(self):
        with self.assertRaises(BlueExpressDestinationError):
            self.resolve(region_code=99)

    def test_rechaza_comuna_de_otra_region(self):
        self.regions.append({
            "code": 15,
            "name": "Arica y Parinacota",
            "communes": [],
        })

        with self.assertRaises(BlueExpressDestinationError):
            self.resolve(region_code=15)

    def test_rechaza_localidad_de_otra_comuna(self):
        self.regions[0]["communes"].append({
            "code": 99999,
            "name": "Comuna de prueba",
            "districts": [{"code": "OTR", "name": "Localidad de prueba"}],
        })

        with self.assertRaises(BlueExpressDestinationError):
            self.resolve(district_code="OTR")

    def test_no_elige_localidad_si_falta(self):
        with self.assertRaises(BlueExpressDestinationError):
            self.resolve(district_code="")

    def test_rechaza_localidad_duplicada(self):
        districts = self.regions[0]["communes"][0]["districts"]
        districts.append(dict(districts[0]))

        with self.assertRaises(BlueExpressDestinationError):
            self.resolve()

    def test_rechaza_respuesta_no_exitosa(self):
        payload = deepcopy(PAYLOAD)
        payload["status"] = False

        with self.assertRaises(BlueExpressAPIError):
            parse_geography(payload)

    def test_rechaza_catalogo_sin_chile(self):
        with self.assertRaises(BlueExpressAPIError):
            parse_geography({"status": True, "data": []})

    def test_rechaza_estructura_de_comunas_invalida(self):
        payload = deepcopy(PAYLOAD)
        payload["data"][0]["states"][0]["ciudades"] = None

        with self.assertRaises(BlueExpressAPIError):
            parse_geography(payload)