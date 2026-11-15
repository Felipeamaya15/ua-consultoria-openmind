"""Datos de la tienda de demostración (ficticios). Los usa cargar_demo.py y el generador de fotos."""

TIENDA = {
    'nombre': 'Taller Quillay',
    'descripcion': 'Ropa y accesorios tejidos y estampados a mano en Chile. Despachamos a todo el país.',
    'correo_negocio': 'contacto@tallerquillay.test',
}

# (código de color, nombre) por producto; "Único" = sin talla
PRODUCTOS = [
    dict(slug='polera-algodon-organico', nombre='Polera Algodón Orgánico', categoria='Poleras', prefijo='POA', precio=12990, fotos=3, activo=True,
         descripcion='Polera de corte clásico en algodón orgánico, suave y resistente al lavado. Costuras reforzadas y cuello que no se deforma.',
         material='Algodón orgánico 100 %', tallas=['S', 'M', 'L', 'XL'], colores=['Negro', 'Blanco'], stock=8, sin_stock=[('XL', 'Blanco')]),
    dict(slug='polera-estampada-cordillera', nombre='Polera Estampada Cordillera', categoria='Poleras', prefijo='POC', precio=14990, fotos=3, activo=True,
         descripcion='Estampado serigrafiado a mano con motivo de cordillera. Cada lote es limitado.',
         material='Algodón peinado 100 %', tallas=['S', 'M', 'L'], colores=['Arena', 'Verde'], stock=6, sin_stock=[]),
    dict(slug='polera-manga-larga-lino', nombre='Polera Manga Larga de Lino', categoria='Poleras', prefijo='POL', precio=19990, fotos=3, activo=True,
         descripcion='Polera de manga larga en mezcla de lino, fresca para el verano y abrigada con una chaqueta.',
         material='Lino 55 %, algodón 45 %', tallas=['M', 'L', 'XL'], colores=['Natural'], stock=5, sin_stock=[]),
    dict(slug='polera-basica-unisex', nombre='Polera Básica Unisex', categoria='Poleras', prefijo='POB', precio=9990, fotos=3, activo=True,
         descripcion='La polera de todos los días: lisa, cómoda y de precio accesible.',
         material='Algodón 100 %', tallas=['S', 'M', 'L', 'XL'], colores=['Gris', 'Negro'], stock=15, sin_stock=[]),
    dict(slug='poleron-canguro-merino', nombre='Polerón Canguro Merino', categoria='Polerones', prefijo='PGM', precio=39990, fotos=4, activo=True,
         descripcion='Polerón con capucha y bolsillo canguro en lana merino. Abrigado sin ser pesado.',
         material='Lana merino 70 %, algodón 30 %', tallas=['S', 'M', 'L'], colores=['Gris', 'Azul'], stock=4, sin_stock=[]),
    dict(slug='poleron-cierre-completo', nombre='Polerón con Cierre Completo', categoria='Polerones', prefijo='PCC', precio=34990, fotos=3, activo=True,
         descripcion='Polerón con cierre metálico y dos bolsillos laterales. Interior afelpado.',
         material='Algodón afelpado', tallas=['M', 'L', 'XL'], colores=['Negro'], stock=6, sin_stock=[]),
    dict(slug='poleron-oversize-algodon', nombre='Polerón Oversize de Algodón', categoria='Polerones', prefijo='POV', precio=32990, fotos=3, activo=True,
         descripcion='Calce holgado y caída suave. Pensado para usar solo o sobre otra prenda.',
         material='Algodón 100 %', tallas=['S', 'M'], colores=['Crema', 'Mostaza'], stock=5, sin_stock=[]),
    dict(slug='gorro-lana-artesanal', nombre='Gorro de Lana Artesanal', categoria='Accesorios', prefijo='GOR', precio=8990, fotos=3, activo=True,
         descripcion='Gorro tejido a mano con lana de oveja. Talla única, elástico y abrigado.',
         material='Lana de oveja', tallas=[], colores=['Rojo', 'Gris', 'Verde'], stock=12, sin_stock=[]),
    dict(slug='bufanda-alpaca', nombre='Bufanda de Alpaca', categoria='Accesorios', prefijo='BUF', precio=24990, fotos=3, activo=True,
         descripcion='Bufanda larga de alpaca, muy suave al tacto y liviana. Tejida en telar.',
         material='Alpaca 100 %', tallas=[], colores=['Natural', 'Café'], stock=7, sin_stock=[]),
    dict(slug='bolso-tote-lona', nombre='Bolso Tote de Lona', categoria='Accesorios', prefijo='TOT', precio=15990, fotos=3, activo=True,
         descripcion='Bolso grande de lona gruesa con bolsillo interior y asas reforzadas.',
         material='Lona de algodón', tallas=[], colores=['Natural', 'Negro'], stock=10, sin_stock=[]),
    dict(slug='cojin-tejido-a-mano', nombre='Cojín Tejido a Mano', categoria='Hogar', prefijo='COJ', precio=18990, fotos=3, activo=True,
         descripcion='Cojín de 45 x 45 cm con funda tejida a mano y relleno incluido. Queda una sola unidad.',
         material='Algodón y lana', tallas=[], colores=['Mostaza'], stock=1, sin_stock=[]),
    dict(slug='manta-telar', nombre='Manta de Telar', categoria='Hogar', prefijo='MAN', precio=45990, fotos=3, activo=False,
         descripcion='Manta tejida en telar tradicional. Producto en preparación (borrador).',
         material='Lana de oveja', tallas=[], colores=['Natural'], stock=3, sin_stock=[]),
]

PROMOCIONES = [
    dict(code='BIENVENIDA10', name='10 % de bienvenida', type='percentage', value=10, minAmount=15000, maxUses=200),
    dict(code='AHORRA5000', name='$ 5.000 de descuento', type='fixed', value=5000, minAmount=30000, maxUses=50),
    dict(code='ENVIOGRATIS', name='Envío gratis sobre $ 40.000', type='free_shipping', value=0, minAmount=40000),
    dict(code='PRIMERO1', name='Un solo uso (prueba de límite)', type='percentage', value=15, minAmount=0, maxUses=1),
    dict(code='VERANO2025', name='Promoción vencida (prueba)', type='percentage', value=20, minAmount=0, startsAt='2025-01-01', endsAt='2025-03-01'),
]

PAGO_TRANSFERENCIA = dict(bank_name='Banco Estado', account_type='Cuenta Vista', account_number='00012345678', holder_rut='11.111.111-1',
                          holder_name='Taller Quillay SpA', confirmation_email='pagos@tallerquillay.test')
# Credenciales PÚBLICAS de integración de Transbank (no mueven dinero real)
TRANSBANK_INTEGRACION = dict(codigo_comercio='597055555532', api_key='579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C', ambiente='INTEGRACION', activo=True)

_DIAS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
RETIRO = dict(
    enabled=True, version=2, address='', schedule='',
    location=dict(region='Metropolitana de Santiago', comuna='Providencia', street='Av. Providencia', number='1234', reference='Local 5', verification=''),
    hours={d: dict(enabled=(d != 'sun'), start=('10:00' if d != 'sun' else ''), end=('14:00' if d == 'sat' else ('18:00' if d != 'sun' else ''))) for d in _DIAS},
)

# región -> (tarifa Chilexpress, plazo, tarifa Starken, plazo)
ZONAS = {
    'Metropolitana de Santiago': (3990, 2, 3490, 2),
    'Valparaíso': (5990, 3, 5490, 3),
    'Biobío': (6990, 4, 6490, 4),
    'La Araucanía': (7490, 5, 6990, 5),
    'Antofagasta': (9990, 6, 8990, 6),
}

CLIENTES = [dict(nombre='Camila Rojas', correo='camila.rojas@clientes.test'), dict(nombre='Diego Soto', correo='diego.soto@clientes.test')]
CLAVE_CLIENTES = 'Cliente-Prueba-2026!'

LEGAL = {
    'terms': 'Estos términos regulan las compras en la tienda Taller Quillay. Los precios están en pesos chilenos e incluyen IVA. El pedido se confirma al recibir el pago. Los despachos se realizan por Chilexpress o Starken, o con retiro en tienda.',
    'privacy': 'Taller Quillay usa tus datos solo para procesar tus pedidos, enviarte avisos del pedido y, si lo autorizas, ofertas por correo. No vendemos tus datos. Puedes pedir su corrección o eliminación escribiendo a contacto@tallerquillay.test.',
    'cookies': 'Usamos cookies para recordar tu carrito y tu sesión. Puedes desactivarlas en tu navegador, aunque algunas funciones de la tienda podrían dejar de funcionar.',
}
