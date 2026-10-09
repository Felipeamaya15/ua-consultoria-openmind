from decimal import Decimal
from django.test import SimpleTestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.shipping.domain.dtos import (
    DireccionDespachoDTO,
    PaqueteDTO,
)
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException,
    FormatoSeguimientoInvalidoException,
    NumeroSeguimientoNoEncontradoException,
)
from apps.shipping.infrastructure.adapters import (
    ChilexpressAdapter,
    StarkenAdapter,
    StandardLogisticsAdapter,
    MultiCarrierLogisticsAdapter,
    get_logistics_adapter,
)
from apps.shipping.application.use_cases import (
    CotizarDespachoEcommerceUseCase,
    ConsultarSeguimientoUseCase,
)


class ChilexpressAdapterTestCase(SimpleTestCase):
    def setUp(self):
        self.adapter = ChilexpressAdapter()
        self.origen = DireccionDespachoDTO(
            calle="Av. Central",
            numero="1000",
            comuna="Santiago",
            region="Metropolitana"
        )
        self.destino_rm = DireccionDespachoDTO(
            calle="Los Leones",
            numero="123",
            comuna="Providencia",
            region="Metropolitana"
        )
        self.destino_extremo = DireccionDespachoDTO(
            calle="Bories",
            numero="456",
            comuna="Punta Arenas",
            region="Magallanes"
        )

    def test_cotizar_envio_metropolitana(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.0"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("15"),
                largo_cm=Decimal("20"),
                valor_declarado=Decimal("15000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_rm, paquetes)
        self.assertEqual(len(cotizaciones), 2)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertIn("CHILEXPRESS_EXPRESS", servicios)
        self.assertIn("CHILEXPRESS_EXTENDIDO", servicios)

        self.assertEqual(servicios["CHILEXPRESS_EXPRESS"].proveedor, "CHILEXPRESS")
        self.assertEqual(servicios["CHILEXPRESS_EXPRESS"].costo, Decimal("3990"))
        self.assertEqual(servicios["CHILEXPRESS_EXPRESS"].dias_habiles_entrega, 1)

        self.assertEqual(servicios["CHILEXPRESS_EXTENDIDO"].costo, Decimal("3290"))
        self.assertEqual(servicios["CHILEXPRESS_EXTENDIDO"].dias_habiles_entrega, 2)

    def test_cotizar_envio_zonas_extremas(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.0"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("15"),
                largo_cm=Decimal("20"),
                valor_declarado=Decimal("25000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_extremo, paquetes)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertEqual(servicios["CHILEXPRESS_EXPRESS"].costo, Decimal("10990"))
        self.assertEqual(servicios["CHILEXPRESS_EXTENDIDO"].costo, Decimal("9490"))

    def test_cotizar_envio_recargo_peso(self):
        # 3.5 kg -> 2.0 kg extra * 950 = +1900
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("3.5"),
                alto_cm=Decimal("20"),
                ancho_cm=Decimal("25"),
                largo_cm=Decimal("30"),
                valor_declarado=Decimal("35000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_rm, paquetes)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertEqual(servicios["CHILEXPRESS_EXPRESS"].costo, Decimal("3990") + Decimal("1900"))
        self.assertEqual(servicios["CHILEXPRESS_EXTENDIDO"].costo, Decimal("3290") + Decimal("1900"))

    def test_cotizar_envio_sin_region_lanza_excepcion(self):
        destino_invalido = DireccionDespachoDTO(
            calle="Sin region",
            numero="1",
            comuna="Santiago",
            region=""
        )
        with self.assertRaises(DireccionFueraDeCoberturaException):
            self.adapter.cotizar_envio(self.origen, destino_invalido, [])

    def test_generar_despacho_chilexpress(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.0"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("10"),
                largo_cm=Decimal("10"),
                valor_declarado=Decimal("10000")
            )
        ]
        guia = self.adapter.generar_despacho("ORD-123", self.origen, self.destino_rm, paquetes)
        self.assertEqual(guia.proveedor, "CHILEXPRESS")
        self.assertTrue(guia.numero_seguimiento.startswith("CHILEX-"))
        self.assertEqual(guia.estado, "EMITIDO")
        self.assertIn("chilexpress.cl", guia.url_etiqueta)

    def test_consultar_seguimiento_exitoso(self):
        tracking = "CHILEX-ABC1234567"
        detalle = self.adapter.consultar_seguimiento(tracking)
        self.assertEqual(detalle.numero_seguimiento, tracking)
        self.assertEqual(detalle.proveedor, "CHILEXPRESS")
        self.assertEqual(detalle.estado_actual, "EN_DISTRIBUCION")
        self.assertTrue(len(detalle.historial_eventos) >= 3)

    def test_consultar_seguimiento_formato_invalido(self):
        with self.assertRaises(FormatoSeguimientoInvalidoException):
            self.adapter.consultar_seguimiento("INVALID_CODE")

    def test_consultar_seguimiento_no_encontrado(self):
        with self.assertRaises(NumeroSeguimientoNoEncontradoException):
            self.adapter.consultar_seguimiento("CHILEX-99990000")


class ShippingQuotationWithChilexpressTestCase(SimpleTestCase):
    def test_envio_gratis_con_chilexpress_en_rm(self):
        adapter = ChilexpressAdapter()
        use_case = CotizarDespachoEcommerceUseCase(logistics_port=adapter)
        resultado = use_case.execute(
            datos_destino={"comuna": "Providencia", "region": "Metropolitana"},
            total_carrito=Decimal("35000"),
            total_items=2
        )
        opciones = resultado["opciones"]
        extendido = next((op for op in opciones if "EXTENDIDO" in op["servicio"]), None)
        self.assertIsNotNone(extendido)
        self.assertEqual(extendido["costo"], 0)
        self.assertTrue(extendido["es_gratis"])
        self.assertIn("ENVÍO GRATIS", extendido["servicio"])


class ShippingAPITestCase(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def test_cotizar_endpoint_con_chilexpress(self):
        payload = {
            "region": "Metropolitana",
            "comuna": "Santiago",
            "total_carrito": "15000.00",
            "total_items": 1,
            "proveedor": "chilexpress"
        }
        response = self.client.post("/api/logistica/cotizar/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        opciones = body["data"]["opciones"]
        self.assertTrue(all(op["proveedor"] == "CHILEXPRESS" for op in opciones))

    def test_cotizar_endpoint_multi_carrier(self):
        payload = {
            "region": "Valparaiso",
            "comuna": "Viña del Mar",
            "total_carrito": "20000.00",
            "total_items": 2,
            "proveedor": "todos"
        }
        response = self.client.post("/api/logistica/cotizar/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        proveedores = {op["proveedor"] for op in body["data"]["opciones"]}
        self.assertIn("CHILEXPRESS", proveedores)
        self.assertIn("LOGISTICA_CENTRAL", proveedores)

    def test_seguimiento_endpoint_chilexpress_exitoso(self):
        response = self.client.get("/api/logistica/seguimiento/CHILEX-XYZ1234567/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        self.assertEqual(body["data"]["proveedor"], "CHILEXPRESS")
        self.assertEqual(body["data"]["estado_actual"], "EN_DISTRIBUCION")

    def test_seguimiento_endpoint_chilexpress_invalido(self):
        response = self.client.get("/api/logistica/seguimiento/INVALIDO/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        body = response.json()
        self.assertFalse(body["exito"])
        self.assertEqual(body["error"]["codigo"], "FORMATO_TRACKING_INVALIDO")

    def test_seguimiento_endpoint_chilexpress_no_encontrado(self):
        response = self.client.get("/api/logistica/seguimiento/CHILEX-0000/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        body = response.json()
        self.assertFalse(body["exito"])
        self.assertEqual(body["error"]["codigo"], "TRACKING_NO_ENCONTRADO")

    def test_seguimiento_endpoint_standard_retrocompatibilidad(self):
        response = self.client.get("/api/logistica/seguimiento/TRK-ABC12345/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        self.assertEqual(body["data"]["proveedor"], "LOGISTICA_CENTRAL")

    def test_cotizar_endpoint_con_starken(self):
        payload = {
            "region": "Metropolitana",
            "comuna": "Providencia",
            "total_carrito": "12000.00",
            "total_items": 1,
            "proveedor": "starken"
        }
        response = self.client.post("/api/logistica/cotizar/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        opciones = body["data"]["opciones"]
        self.assertTrue(all(op["proveedor"] == "STARKEN" for op in opciones))
        servicios = [op["servicio"] for op in opciones]
        self.assertIn("STARKEN_ESTANDAR_DOMICILIO", servicios)
        self.assertIn("STARKEN_SUCURSAL", servicios)

    def test_cotizar_endpoint_dedicado_chilexpress(self):
        payload = {
            "region": "Valparaíso",
            "comuna": "Viña del Mar",
            "total_carrito": "22000.00",
            "total_items": 1
        }
        response = self.client.post("/api/logistica/cotizar/chilexpress/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        opciones = body["data"]["opciones"]
        self.assertTrue(all(op["proveedor"] == "CHILEXPRESS" for op in opciones))
        self.assertEqual(body["data"]["destino"]["region"], "VALPARAISO")

    def test_cotizar_endpoint_dedicado_starken(self):
        payload = {
            "region": "Biobío",
            "comuna": "Concepción",
            "total_carrito": "18000.00",
            "total_items": 2
        }
        response = self.client.post("/api/logistica/cotizar/starken/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        opciones = body["data"]["opciones"]
        self.assertTrue(all(op["proveedor"] == "STARKEN" for op in opciones))
        self.assertEqual(body["data"]["destino"]["region"], "BIOBIO")

    def test_cotizar_regiones_con_acentos_y_alias(self):
        payload = {
            "region": "Araucanía",
            "comuna": "Temuco",
            "total_carrito": "10000.00",
            "total_items": 1,
            "proveedor": "chilexpress"
        }
        response = self.client.post("/api/logistica/cotizar/", data=payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        self.assertEqual(body["data"]["destino"]["region"], "LA ARAUCANIA")

    def test_seguimiento_endpoint_starken_exitoso(self):
        response = self.client.get("/api/logistica/seguimiento/STK-DEMO1234567/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertTrue(body["exito"])
        self.assertEqual(body["data"]["proveedor"], "STARKEN")
        self.assertEqual(body["data"]["estado_actual"], "EN_REPARTO_DOMICILIO")

    def test_seguimiento_endpoint_starken_no_encontrado(self):
        response = self.client.get("/api/logistica/seguimiento/STK-99990000/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        body = response.json()
        self.assertFalse(body["exito"])
        self.assertEqual(body["error"]["codigo"], "TRACKING_NO_ENCONTRADO")


class StarkenAdapterTestCase(SimpleTestCase):
    def setUp(self):
        self.adapter = StarkenAdapter()
        self.origen = DireccionDespachoDTO(
            calle="Av. Central",
            numero="1000",
            comuna="Santiago",
            region="Metropolitana"
        )
        self.destino_rm = DireccionDespachoDTO(
            calle="Apoquindo",
            numero="2000",
            comuna="Las Condes",
            region="Metropolitana"
        )
        self.destino_extremo = DireccionDespachoDTO(
            calle="Colón",
            numero="100",
            comuna="Arica",
            region="Arica y Parinacota"
        )

    def test_cotizar_envio_metropolitana(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.5"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("15"),
                largo_cm=Decimal("20"),
                valor_declarado=Decimal("15000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_rm, paquetes)
        self.assertEqual(len(cotizaciones), 3)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertIn("STARKEN_ESTANDAR_DOMICILIO", servicios)
        self.assertIn("STARKEN_SUCURSAL", servicios)
        self.assertIn("STARKEN_EXPRESS", servicios)

        self.assertEqual(servicios["STARKEN_ESTANDAR_DOMICILIO"].proveedor, "STARKEN")
        self.assertEqual(servicios["STARKEN_ESTANDAR_DOMICILIO"].costo, Decimal("3700"))
        self.assertEqual(servicios["STARKEN_SUCURSAL"].costo, Decimal("3200"))
        self.assertEqual(servicios["STARKEN_EXPRESS"].costo, Decimal("4500"))

    def test_cotizar_envio_zonas_extremas(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.0"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("10"),
                largo_cm=Decimal("10"),
                valor_declarado=Decimal("20000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_extremo, paquetes)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertEqual(servicios["STARKEN_ESTANDAR_DOMICILIO"].costo, Decimal("9200"))
        self.assertEqual(servicios["STARKEN_SUCURSAL"].costo, Decimal("7800"))
        self.assertEqual(servicios["STARKEN_EXPRESS"].costo, Decimal("10800"))

    def test_cotizar_envio_recargo_peso(self):
        # 3.5 kg -> 1.5 kg extra * 850 = +1275
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("3.5"),
                alto_cm=Decimal("20"),
                ancho_cm=Decimal("25"),
                largo_cm=Decimal("30"),
                valor_declarado=Decimal("35000")
            )
        ]
        cotizaciones = self.adapter.cotizar_envio(self.origen, self.destino_rm, paquetes)
        servicios = {c.servicio: c for c in cotizaciones}

        self.assertEqual(servicios["STARKEN_ESTANDAR_DOMICILIO"].costo, Decimal("3700") + Decimal("1275"))
        self.assertEqual(servicios["STARKEN_SUCURSAL"].costo, Decimal("3200") + Decimal("1275"))

    def test_cotizar_envio_sin_region_lanza_excepcion(self):
        destino_invalido = DireccionDespachoDTO(
            calle="Calle",
            numero="1",
            comuna="Valparaíso",
            region=""
        )
        with self.assertRaises(DireccionFueraDeCoberturaException):
            self.adapter.cotizar_envio(self.origen, destino_invalido, [])

    def test_generar_despacho_starken(self):
        paquetes = [
            PaqueteDTO(
                peso_kg=Decimal("1.0"),
                alto_cm=Decimal("10"),
                ancho_cm=Decimal("10"),
                largo_cm=Decimal("10"),
                valor_declarado=Decimal("10000")
            )
        ]
        guia = self.adapter.generar_despacho("ORD-999", self.origen, self.destino_rm, paquetes)
        self.assertEqual(guia.proveedor, "STARKEN")
        self.assertTrue(guia.numero_seguimiento.startswith("STK-"))
        self.assertEqual(guia.estado, "EMITIDO")
        self.assertIn("starken.cl", guia.url_etiqueta)

    def test_consultar_seguimiento_exitoso(self):
        tracking = "STK-ABC1234567"
        detalle = self.adapter.consultar_seguimiento(tracking)
        self.assertEqual(detalle.numero_seguimiento, tracking)
        self.assertEqual(detalle.proveedor, "STARKEN")
        self.assertEqual(detalle.estado_actual, "EN_REPARTO_DOMICILIO")
        self.assertTrue(len(detalle.historial_eventos) >= 3)

    def test_consultar_seguimiento_formato_invalido(self):
        with self.assertRaises(FormatoSeguimientoInvalidoException):
            self.adapter.consultar_seguimiento("OTRO_FORMATO")

    def test_consultar_seguimiento_no_encontrado(self):
        with self.assertRaises(NumeroSeguimientoNoEncontradoException):
            self.adapter.consultar_seguimiento("STK-0000")

    def test_envio_gratis_con_starken_en_rm(self):
        use_case = CotizarDespachoEcommerceUseCase(logistics_port=self.adapter)
        resultado = use_case.execute(
            datos_destino={"comuna": "Santiago", "region": "Metropolitana"},
            total_carrito=Decimal("35000"),
            total_items=2
        )
        opciones = resultado["opciones"]
        estandar = next((op for op in opciones if "ESTANDAR" in op["servicio"]), None)
        self.assertIsNotNone(estandar)
        self.assertEqual(estandar["costo"], 0)
        self.assertTrue(estandar["es_gratis"])
        self.assertIn("ENVÍO GRATIS", estandar["servicio"])
