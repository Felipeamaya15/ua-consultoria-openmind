import { useEffect, useRef, useState } from "react"
import { EmptyListState, LoadingState } from "../../../shared/components/states"
import { formatPrice, Promotion } from "../data/mockAdminData"
import { useAdmin } from "../context/AdminContext"
import {
  Button,
  Badge,
  Input,
  Select,
  Toggle,
  Modal,
  Alert,
} from "../components/ui"
import { promotionService } from "../services/promotionService"
import { formatBusinessDate } from '../services/businessTime'

const CODE_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

function formatPromoDate(value?: string): string {
  if (!value) return "Sin límite"
  return formatBusinessDate(value.trim(), true) || 'Fecha no disponible'
}

export default function Promotions() {
  const { config, setConfig } = useAdmin()
  const [promos, setPromotionRows] = useState<Promotion[]>([])
  const [original, setOriginal] = useState<Promotion | null>(null)
  const [error, setError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null)
  const mutation = useRef(false)

  const setPromos = (update: (previous: Promotion[]) => Promotion[]) => {
    const next = update(promos)
    setPromotionRows(next)
    setConfig({ ...config, promotions: next })
    return true
  }

  useEffect(() => {
    let active = true
    promotionService
      .list()
      .then((rows) => {
        if (active) setPromos(() => rows)
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las promociones."
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const patch = (changes: Partial<Promotion>) =>
    setEditPromo((current) => ({ ...current, ...changes }))

  const save = async () => {
    if (mutation.current) return
    setError("")
    setStatusMessage("")

    if (!editPromo?.name?.trim()) {
      setError("Ingresa el nombre de la promoción.")
      return
    }

    const code = editPromo.code?.trim().toUpperCase() ?? ""
    if (!code && editPromo.type !== "precio_oferta") {
      setError("Ingresa un código promocional (ej: VERANO20).")
      return
    }
    if (code && !CODE_REGEX.test(code)) {
      setError("El código solo puede contener letras, números y guiones.")
      return
    }
    if (
      code && promos.some(
        (p) => p.id !== editPromo.id && p.code?.trim().toUpperCase() === code
      )
    ) {
      setError("Ya existe una promoción con ese código.")
      return
    }

    const type = editPromo.type ?? "percentage"
    const value = type === "free_shipping" ? 0 : Number(editPromo.value ?? 0)
    if (type === "percentage" && (!Number.isFinite(value) || value <= 0 || value > 100)) {
      setError("El porcentaje de descuento debe ser mayor que 0 y no puede superar 100%.")
      return
    }
    if (type === "fixed" && (!Number.isFinite(value) || value <= 0)) {
      setError("El monto fijo de descuento debe ser mayor que cero.")
      return
    }

    const validDate = (raw?: string) => !raw || /^\d{4}-\d{2}-\d{2}$/.test(raw) || (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw)));
    if (!validDate(editPromo.startsAt) || !validDate(editPromo.endsAt)) {
      setError('Usa una fecha de calendario o un instante con zona horaria.'); return;
    }

    if (
      (editPromo.minAmount ?? 0) < 0 ||
      (editPromo.maxUses !== undefined &&
        (!Number.isInteger(editPromo.maxUses) || editPromo.maxUses < 0 || (editPromo.maxUses === 0 && original?.maxUses !== 0)))
    ) {
      setError("Revisa el monto mínimo y el límite de usos.")
      return
    }

    const draft: Partial<Promotion> = {
      ...editPromo,
      name: editPromo.name.trim(),
      code,
      type,
      value,
      minAmount: editPromo.minAmount ?? 0,
      maxUses: editPromo.maxUses,
      usedCount: editPromo.usedCount ?? 0,
      startsAt: editPromo.startsAt,
      endsAt: editPromo.endsAt || undefined,
      active: editPromo.active ?? true,
    }

    // Compare the edited fields before normalization: renaming must preserve
    // historical codes, free-shipping amounts and complete validity instants.
    const changes = original ? Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'id' && key !== 'usedCount' && editPromo[key as keyof Promotion] !== original[key as keyof Promotion])) : draft;
    mutation.current = true
    setSaving(true)
    try {
      const promo = editPromo.id
        ? await promotionService.update({ ...changes, id: editPromo.id })
        : await promotionService.create(draft)
      if (
        setPromos((previous) =>
          previous.some((p) => p.id === promo.id)
            ? previous.map((p) => (p.id === promo.id ? promo : p))
            : [promo, ...previous]
        )
      ) {
        setShowModal(false)
        setStatusMessage(
          editPromo.id
            ? "Promoción actualizada correctamente."
            : "Promoción creada correctamente."
        )
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la promoción."
      )
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }

  const toggleActive = async (id: string) => {
    if (mutation.current) return
    const current = promos.find((p) => p.id === id)
    if (!current) return
    mutation.current = true
    setSaving(true)
    setError("")
    setStatusMessage("")
    try {
      const updated = await promotionService.update({
        id: current.id,
        active: !current.active,
      })
      setPromos((prev) => prev.map((p) => (p.id === id ? updated : p)))
      setStatusMessage(
        `Promoción "${updated.name}" ${updated.active ? "activada" : "desactivada"}.`
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar la promoción."
      )
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }

  const handleDelete = async (promo: Promotion) => {
    if (mutation.current) return
    if (
      typeof window !== "undefined" &&
      !window.confirm(`¿Eliminar la promoción "${promo.name}" (${promo.code})?`)
    ) {
      return
    }
    mutation.current = true
    setSaving(true)
    setError("")
    setStatusMessage("")
    try {
      await promotionService.remove(promo.id)
      setPromos((prev) => prev.filter((p) => p.id !== promo.id))
      setStatusMessage(`Promoción "${promo.name}" eliminada correctamente.`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo eliminar la promoción."
      )
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }

  const typeBadge = (type: Promotion["type"]) =>
    ({
      percentage: <Badge variant="info">% Descuento</Badge>,
      fixed: <Badge variant="accent">$ Fijo</Badge>,
      free_shipping: <Badge variant="success">Envío gratis</Badge>,
      precio_oferta: <Badge variant="info">Oferta de producto</Badge>,
    })[type]

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm">Vigencias en America/Santiago. Los precios de oferta se configuran en Productos; sus registros no son cupones.</p>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {promos.length} promociones creadas
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<span>+</span>}
          onClick={() => {
            setError("")
            setStatusMessage("")
            setOriginal(null)
            setEditPromo({
              type: "percentage",
              startsAt: new Date().toISOString().slice(0, 10),
              active: true,
            })
            setShowModal(true)
          }}
        >
          Nueva promoción
        </Button>
      </div>

      {statusMessage && !showModal && (
        <Alert variant="success">{statusMessage}</Alert>
      )}

      <div className="grid grid-cols-1 gap-3">
        {loading && (
          <LoadingState size="sm" align="start" spacing="compact">Cargando promociones...</LoadingState>
        )}
        {!loading && error && !showModal && <Alert variant="error">{error}</Alert>}
        {!loading && !error && promos.length === 0 && (
          <EmptyListState spacing="none" className="bg-white border border-[var(--border)] rounded-xl p-8">Aún no hay promociones creadas en tu tienda. Crea tu primera promoción con el botón «Nueva promoción».</EmptyListState>
        )}
        {promos.map((promo) => (
          <div
            key={promo.id}
            className={`bg-white border-2 rounded-xl p-4 transition-all ${
              promo.active
                ? "border-[var(--border)]"
                : "border-[var(--border)] opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-sm">{promo.name}</h3>
                  {typeBadge(promo.type)}
                  <Badge variant={promo.active ? "success" : "default"}>
                    {promo.active ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">
                  {promo.code && (
                    <span>
                      Código:{" "}
                      <strong className="font-mono text-[var(--foreground)]">
                        {promo.code}
                      </strong>
                    </span>
                  )}
                  <span>
                    Valor:{" "}
                    <strong className="text-[var(--foreground)]">
                      {promo.type === "percentage"
                        ? `${promo.value}%`
                        : promo.type === "fixed"
                          ? formatPrice(promo.value)
                          : promo.type === "precio_oferta" ? "Precio configurado en producto/variante" : "Envío gratis"}
                    </strong>
                  </span>
                  {Boolean(promo.minAmount && promo.minAmount > 0) && (
                    <span>
                      Monto mínimo:{" "}
                      <strong className="text-[var(--foreground)]">
                        {formatPrice(promo.minAmount!)}
                      </strong>
                    </span>
                  )}
                  {promo.maxUses && (
                    <span>
                      Usos:{" "}
                      <strong className="text-[var(--foreground)]">
                        {promo.usedCount}/{promo.maxUses}
                      </strong>
                    </span>
                  )}
                  {promo.startsAt && (
                    <span>
                      Desde:{" "}
                      <strong className="text-[var(--foreground)]">
                        {formatPromoDate(promo.startsAt)}
                      </strong>
                    </span>
                  )}
                  {promo.endsAt && (
                    <span>
                      Vence:{" "}
                      <strong className="text-[var(--foreground)]">
                        {formatPromoDate(promo.endsAt)}
                      </strong>
                    </span>
                  )}
                </div>
                {promo.maxUses && (
                  <div className="mt-2 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden w-32">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full"
                      style={{
                        width: `${Math.min(100, (promo.usedCount / promo.maxUses) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Toggle
                  ariaLabel={`Activar ${promo.name}`}
                  checked={promo.active}
                  onChange={() => toggleActive(promo.id)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setError("")
                    setStatusMessage("")
                    setOriginal(promo)
                    setEditPromo({ ...promo })
                    setShowModal(true)
                  }}
                  className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-xs"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(promo)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors text-xs"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editPromo?.id ? "Editar promoción" : "Nueva promoción"}
        size="lg"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Nombre interno"
            value={editPromo?.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Ej: Descuento Verano 2026"
          />
          <Input
            label={editPromo?.type === "precio_oferta" ? "Código de referencia (opcional)" : "Código de descuento (obligatorio)"}
            required={editPromo?.type !== "precio_oferta"} maxLength={40} persistentHint
            value={editPromo?.code ?? ""}
            onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
            placeholder="VERANO20"
            hint="Usa letras, números y guiones (ej: BIENVENIDA-10)"
          />
          <Select
            label="Tipo de descuento"
            value={editPromo?.type ?? "percentage"}
            onChange={(e) => {
              const nextType = e.target.value as Promotion["type"]
              patch({
                type: nextType,
                ...(nextType === "free_shipping" ? { value: 0 } : {}),
              })
            }}
            options={[
              { value: "percentage", label: "Porcentaje (%)" },
              { value: "fixed", label: "Monto fijo ($)" },
              { value: "free_shipping", label: "Envío gratis" },
              ...(editPromo?.type === "precio_oferta" ? [{ value: "precio_oferta", label: "Oferta de producto (sin cupón)" }] : []),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={
                editPromo?.type === "percentage"
                  ? "Valor (%)"
                  : editPromo?.type === "fixed"
                    ? "Valor ($)"
                    : "Valor"
              }
              type="number"
              min={editPromo?.type === "free_shipping" || editPromo?.type === "precio_oferta" ? 0 : 0.01}
              step="0.01"
              max={editPromo?.type === "percentage" ? 100 : undefined}
              disabled={editPromo?.type === "free_shipping"}
              value={
                editPromo?.type === "free_shipping"
                  ? 0
                  : (editPromo?.value ?? "")
              }
              onChange={(e) =>
                patch({
                  value: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder={editPromo?.type === "fixed" ? "5000" : "20"}
              hint={
                editPromo?.type === "percentage"
                  ? "Entre 1% y 100%"
                  : undefined
              }
            />
            <Input
              label="Monto mínimo de compra"
              type="number"
              min={0}
              value={editPromo?.minAmount ?? ""}
              onChange={(e) =>
                patch({
                  minAmount:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder="20000"
              hint="Opcional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Inicio de vigencia"
              type="text"
              placeholder="2026-10-19 o instante con zona"
              hint="Una fecha incluye el día en America/Santiago. Vacío: sin límite. Los instantes conservan su hora y zona."
              value={editPromo?.startsAt ?? ""}
              onChange={(e) => patch({ startsAt: e.target.value })}
            />
            <Input
              label="Fin de vigencia"
              type="text"
              placeholder="2026-10-19 o instante con zona"
              value={editPromo?.endsAt ?? ""}
              onChange={(e) => patch({ endsAt: e.target.value })}
              hint="Opcional"
            />
          </div>
          <Input
            label="Límite de usos"
            type="number"
            min={0}
            value={editPromo?.maxUses ?? ""}
            onChange={(e) =>
              patch({
                maxUses:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            placeholder="Sin límite"
            hint="Opcional: entero mayor que cero. Vacío significa sin límite; un cero histórico se conserva al editar otros campos."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar promoción"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
