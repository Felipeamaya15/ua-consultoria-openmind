import { useEffect, useState } from "react"
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

const CODE_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

function formatPromoDate(value?: string): string {
  if (!value) return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("es-CL")
}

export default function Promotions() {
  const { config, setConfig } = useAdmin()
  const [promos, setPromotionRows] = useState<Promotion[]>([])
  const [error, setError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null)

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
    setError("")
    setStatusMessage("")

    if (!editPromo?.name?.trim()) {
      setError("Ingresa el nombre de la promoción.")
      return
    }

    const code = editPromo.code?.trim().toUpperCase() ?? ""
    if (!code) {
      setError("Ingresa un código promocional (ej: VERANO20).")
      return
    }
    if (!CODE_REGEX.test(code)) {
      setError("El código solo puede contener letras, números y guiones.")
      return
    }
    if (
      promos.some(
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

    if (
      !editPromo.startsAt ||
      (editPromo.endsAt && editPromo.endsAt < editPromo.startsAt)
    ) {
      setError("Revisa las fechas de inicio y fin.")
      return
    }

    if (
      (editPromo.minAmount ?? 0) < 0 ||
      (editPromo.maxUses !== undefined &&
        (!Number.isInteger(editPromo.maxUses) || editPromo.maxUses < 1))
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

    setSaving(true)
    try {
      const promo = editPromo.id
        ? await promotionService.update(draft as Promotion)
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
      setSaving(false)
    }
  }

  const toggleActive = async (id: string) => {
    const current = promos.find((p) => p.id === id)
    if (!current) return
    setError("")
    setStatusMessage("")
    try {
      const updated = await promotionService.update({
        ...current,
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
    }
  }

  const handleDelete = async (promo: Promotion) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`¿Eliminar la promoción "${promo.name}" (${promo.code})?`)
    ) {
      return
    }
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
    }
  }

  const typeBadge = (type: Promotion["type"]) =>
    ({
      percentage: <Badge variant="info">% Descuento</Badge>,
      fixed: <Badge variant="accent">$ Fijo</Badge>,
      free_shipping: <Badge variant="success">Envío gratis</Badge>,
    })[type]

  return (
    <div className="flex flex-col gap-5">
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
          <p role="status" className="text-sm text-[var(--muted-foreground)]">
            Cargando promociones...
          </p>
        )}
        {!loading && error && !showModal && <Alert variant="error">{error}</Alert>}
        {!loading && !error && promos.length === 0 && (
          <div className="bg-white border border-[var(--border)] rounded-xl p-8 text-center text-sm text-[var(--muted-foreground)]">
            Aún no hay promociones creadas en tu tienda. Crea tu primera promoción con el botón «Nueva promoción».
          </div>
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
                          : "Envío gratis"}
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
            label="Código de descuento"
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
              min={editPromo?.type === "free_shipping" ? 0 : 1}
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
              label="Fecha de inicio"
              type="date"
              value={editPromo?.startsAt ?? ""}
              onChange={(e) => patch({ startsAt: e.target.value })}
            />
            <Input
              label="Fecha de fin"
              type="date"
              value={editPromo?.endsAt ?? ""}
              onChange={(e) => patch({ endsAt: e.target.value })}
              hint="Opcional"
            />
          </div>
          <Input
            label="Límite de usos"
            type="number"
            min={1}
            value={editPromo?.maxUses ?? ""}
            onChange={(e) =>
              patch({
                maxUses:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            placeholder="Sin límite"
            hint="Opcional"
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