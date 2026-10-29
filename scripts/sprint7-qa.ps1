# SCRUM-491/497: ejecutar en la raiz del repositorio con Docker Desktop activo.
# No hace push, commits, cambios en Jira ni borra volúmenes.
$ErrorActionPreference = 'Stop'
Write-Host '== Sprint 7 | Verificacion local =='
docker compose ps
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose no esta listo.' }

docker compose exec backend python manage.py check
if ($LASTEXITCODE -ne 0) { throw 'Django check fallo.' }

docker compose exec backend python manage.py test apps.authentication.tests.test_payment_config_security apps.authentication.tests.test_password_hasher_sprint7 apps.authentication.tests.test_entrepreneur_profile apps.authentication.tests.test_profile apps.core.test_seguridad_credenciales_api apps.core.test_tracking_security apps.core.test_tenant_sql apps.core.test_tenant
if ($LASTEXITCODE -ne 0) { throw 'Pruebas de seguridad Django fallaron.' }

docker compose exec backend python manage.py test apps.core.test_checkout apps.core.test_order_filter apps.core.test_customer_orders apps.core.test_promotions apps.core.test_delivery apps.core.test_legal
if ($LASTEXITCODE -ne 0) { throw 'Pruebas funcionales Django fallaron.' }

docker compose exec frontend node --test tests/checkout-shipping.cjs tests/sprint7-responsive.cjs tests/sprint7-payment-security.cjs tests/cart-checkout.cjs tests/guest-cart.cjs tests/transfer-validation.cjs tests/customer-orders.cjs tests/promotions.cjs
if ($LASTEXITCODE -ne 0) { throw 'Pruebas frontend fallaron.' }
Write-Host 'Automatizaciones terminadas. Falta validacion visual manual segun docs/sprint7.'
