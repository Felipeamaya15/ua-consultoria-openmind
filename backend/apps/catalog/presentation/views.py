from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.catalog.application.services import VariantService

class ProductVariantsView(APIView):
    authentication_classes = []

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = VariantService()

    # Tarea 1: Crear y persistir variante
    def post(self, request, product_id):
        try:
            variante = self.service.create_variant(product_id, request.data)
            return Response(
                {"mensaje": "Variante creada en MongoDB", "variante": variante},
                status=status.HTTP_201_CREATED
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # Tarea 2: Actualizar datos editables de una variante por su SKU
    def patch(self, request, product_id, sku):
        try:
            self.service.update_variant(product_id, sku, request.data)
            return Response(
                {"mensaje": f"Variante '{sku}' actualizada correctamente."},
                status=status.HTTP_200_OK
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PurchaseVariantView(APIView):
    authentication_classes = []

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = VariantService()

    # Tarea 3: Validar stock 0 y procesar compra atómica
    def post(self, request):
        sku = request.data.get("sku")
        cantidad = int(request.data.get("cantidad", 1))
        
        try:
            self.service.process_purchase(sku, cantidad)
            return Response(
                {"mensaje": f"Compra procesada. Stock descontado para {sku}."},
                status=status.HTTP_200_OK
            )
        except ValueError as e:
            return Response(
                {"error": "COMPRA_RECHAZADA", "detalle": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
from apps.catalog.infrastructure.repositories import ProductRepository

class ProductListView(APIView):
    authentication_classes = []

    def get(self, request):
        repo = ProductRepository()
        # Lista los productos de la tienda '1' (o usa request.query_params si quieres filtrar)
        tienda_id = request.query_params.get('tienda_id', '1')
        productos = repo.list_by_store(tienda_id=tienda_id)
        return Response(productos, status=status.HTTP_200_OK)