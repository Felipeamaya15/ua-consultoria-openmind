# Tienda de demostración (solo para pruebas)

Carga una tienda completa con datos ficticios para probar el sistema como si fuera de un emprendedor real.
**No se usa en producción.** Todo (marca, correos, cuenta bancaria, RUT) es inventado; las fotos son ilustraciones.

Contiene:
- 12 productos en 4 categorías (Poleras, Polerones, Accesorios, Hogar), con tallas, colores y stock
  (incluye una variante agotada, un producto con una sola unidad y uno en borrador).
- Despachos Chilexpress y Starken con tarifas por comuna (164 destinos) y retiro en tienda.
- Medios de pago: transferencia bancaria y Webpay en ambiente de integración (credenciales públicas de Transbank).
- 5 códigos de descuento (porcentaje, monto fijo, envío gratis, un solo uso y uno vencido).
- Textos legales, datos de la tienda y 2 clientes de prueba.
- Para subir desde el panel: `logo-icono.png` (solo el símbolo; la plantilla ya escribe el nombre), `logo-taller-quillay.png` y `logo-taller-quillay-claro.png` (logo completo, fondo transparente, para fondos claros y oscuros) y `portada-ejemplo.jpg` (portada sin texto).
- `limpiar_pruebas.py`: borra los productos de pruebas anteriores (primero solo muestra qué borraría).

Se puede ejecutar varias veces sin duplicar nada. Con `SEED_FOTOS=1` reemplaza solo las fotos de los productos ya cargados.
