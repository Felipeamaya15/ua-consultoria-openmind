<#
Pruebas de regresión por área -> genera docs/qa-regresion.md
Uso (desde la raíz del repo, con Docker corriendo y `docker compose up` activo):
  powershell -ExecutionPolicy Bypass -File scripts/regression-report.ps1
#>
$ErrorActionPreference = "Continue"
$commit = (git rev-parse --short HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$fecha  = Get-Date -Format "yyyy-MM-dd HH:mm"

$areas = [ordered]@{
  "Autenticación"            = @("apps.authentication.tests")
  "Productos / catálogo"     = @("apps.catalog.test_creation","apps.catalog.test_editing","apps.catalog.test_stock","apps.catalog.test_inventory","apps.catalog.test_tenant")
  "Carrito"                  = @("apps.catalog.test_cart")
  "Checkout / pedidos"       = @("apps.core.test_checkout","apps.core.test_delivery","apps.core.test_stock","apps.core.test_tracking_security")
  "Promociones"              = @("apps.core.test_promotions")
  "Pagos"                    = @("apps.catalog.test_payment_port","apps.core.test_transfer_configuration","apps.core.test_credenciales_cifradas","apps.core.test_linkify_notificacion","apps.core.test_linkify_configuracion","apps.core.test_seguridad_credenciales_api")
  "Envíos / integraciones"   = @("apps.shipping","apps.core.test_shipping","apps.core.test_shipping_errores")
  "Correos de pedido"        = @("apps.core.test_correos_pedido","apps.core.test_correos_webpay","apps.core.test_correo_despacho")
  "Regresiones históricas"   = @("apps.catalog.test_product_flow_regressions","apps.core.test_stability","apps.core.test_integration_blockers","apps.core.test_merge_compatibility")
}

$filas = @(); $detalle = @()
foreach ($area in $areas.Keys) {
  Write-Host "==> $area" -ForegroundColor Cyan
  $out = docker compose exec -T backend python manage.py test @($areas[$area]) --noinput 2>&1 | Out-String
  $ran = if ($out -match "Ran (\d+) tests?") { $Matches[1] } else { "?" }
  $ok  = ($out -match "(?m)^OK") 
  $res = if ($ok) { "CUMPLE" } else { "NO CUMPLE" }
  $filas += "| $area | $ran | $res |"
  if (-not $ok) {
    $fallas = ($out -split "`n" | Where-Object { $_ -match "^(ERROR|FAIL):" }) -join "`n"
    if (-not $fallas) { $fallas = ($out -split "`n" | Select-Object -Last 15) -join "`n" }
    $detalle += "### $area`n``````n$fallas`n```````n"
  }
}

$md = @"
# Registro de pruebas de regresión

- Rama: $branch | Commit probado: $commit | Fecha: $fecha

| Área | Tests ejecutados | Resultado |
| --- | --- | --- |
$($filas -join "`n")

## Detalle de NO CUMPLE
$(if ($detalle) { $detalle -join "`n" } else { "Sin regresiones detectadas." })

> Pendiente: añadir evidencia (capturas) y enlazar bugs de Jira para cada NO CUMPLE.
"@
New-Item -ItemType Directory -Force docs | Out-Null
$md | Set-Content -Encoding UTF8 docs/qa-regresion.md
Write-Host "Informe generado: docs/qa-regresion.md" -ForegroundColor Green
