import { useState } from "react"
import { formatPrice, Promotion } from "../data/mockAdminData"
import { useAdmin } from "../context/AdminContext";
import {
  Button,
  Badge,
  Input,
  Select,
  Toggle,
  Modal,
  Alert,
} from "../components/ui"

export default function Promotions() {
  const {config,setConfig} = useAdmin();
  const promos = config.promotions;
  const [error,setError] = useState("");
  const setPromos = (update:(previous:Promotion[])=>Promotion[]) => setConfig({...config,promotions:update(config.promotions)});
  const [showModal, setShowModal] = useState(false)
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null)

  const patch = (changes:Partial<Promotion>) => setEditPromo(current => ({...current,...changes}));
  const save = () => {
    if(!editPromo?.name?.trim()) {setError('Ingresa el nombre de la promoción.'); return;}
    const type=editPromo.type ?? 'percentage', value=Number(editPromo.value ?? 0);
    if(type !== 'free_shipping' && (!Number.isFinite(value) || value<=0 || (type==='percentage' && value>100))) {setError('El descuento debe ser positivo y el porcentaje no puede superar 100.');return;}
    if(!editPromo.startsAt || (editPromo.endsAt && editPromo.endsAt<editPromo.startsAt)) {setError('Revisa las fechas de inicio y fin.');return;}
    if((editPromo.minAmount ?? 0)<0 || (editPromo.maxUses !== undefined && (!Number.isInteger(editPromo.maxUses) || editPromo.maxUses<1))) {setError('Revisa el monto mínimo y el límite de usos.');return;}
    const code=editPromo.code?.trim().toUpperCase();
    if(code && promos.some(p=>p.id!==editPromo.id && p.code?.toUpperCase()===code)) {setError('Ya existe una promoción con ese código.');return;}
    const promo:Promotion={...editPromo,id:editPromo.id ?? crypto.randomUUID(),name:editPromo.name.trim(),code,type,value:type==='free_shipping'?0:value,usedCount:editPromo.usedCount ?? 0,startsAt:editPromo.startsAt,active:editPromo.active ?? true};
    if(setPromos(previous => previous.some(p=>p.id===promo.id)?previous.map(p=>p.id===promo.id?promo:p):[...previous,promo])) setShowModal(false);
  };
  const toggleActive = (id: string) => {
    setPromos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    )
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
            setError(""); setEditPromo({type:"percentage",startsAt:new Date().toISOString().slice(0,10)})
            setShowModal(true)
          }}
        >
          Nueva promoción
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
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
                  {promo.minAmount && (
                    <span>
                      Monto mínimo:{" "}
                      <strong className="text-[var(--foreground)]">
                        {formatPrice(promo.minAmount)}
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
                  {promo.endsAt && (
                    <span>
                      Vence:{" "}
                      <strong className="text-[var(--foreground)]">
                        {new Date(promo.endsAt).toLocaleDateString("es-CL")}
                      </strong>
                    </span>
                  )}
                </div>
                {promo.maxUses && (
                  <div className="mt-2 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden w-32">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full"
                      style={{
                        width: `${(promo.usedCount / promo.maxUses) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  ariaLabel={`Activar ${promo.name}`} checked={promo.active}
                  onChange={() => toggleActive(promo.id)}
                />
                <button
                  onClick={() => {
                    setError(""); setEditPromo({...promo})
                    setShowModal(true)
                  }}
                  className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-xs"
                >
                  Editar
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
        <form className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();save();}}>
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Nombre interno"
            value={editPromo?.name ?? ""} onChange={e=>patch({name:e.target.value})}
            placeholder="Ej: Descuento Verano 2025"
          />
          <Input
            label="Código de descuento (opcional)"
            value={editPromo?.code ?? ""} onChange={e=>patch({code:e.target.value})}
            placeholder="VERANO20"
            hint="Deja vacío para aplicar automáticamente sin código"
          />
          <Select
            label="Tipo de descuento"
            value={editPromo?.type ?? "percentage"} onChange={e=>patch({type:e.target.value as Promotion["type"]})}
            options={[
              { value: "percentage", label: "Porcentaje (%)" },
              { value: "fixed", label: "Monto fijo ($)" },
              { value: "free_shipping", label: "Envío gratis" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor"
              type="number"
              min={0} value={editPromo?.value ?? ""} onChange={e=>patch({value:e.target.value === "" ? undefined : Number(e.target.value)})}
              placeholder="20"
            />
            <Input
              label="Monto mínimo de compra"
              type="number"
              min={0} value={editPromo?.minAmount ?? ""} onChange={e=>patch({minAmount:e.target.value === "" ? undefined : Number(e.target.value)})}
              placeholder="20000"
              hint="Opcional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha de inicio"
              type="date"
              value={editPromo?.startsAt ?? ""} onChange={e=>patch({startsAt:e.target.value})}
            />
            <Input
              label="Fecha de fin"
              type="date"
              value={editPromo?.endsAt ?? ""} onChange={e=>patch({endsAt:e.target.value})}
              hint="Opcional"
            />
          </div>
          <Input
            label="Límite de usos"
            type="number"
            min={0} value={editPromo?.maxUses ?? ""} onChange={e=>patch({maxUses:e.target.value === "" ? undefined : Number(e.target.value)})}
            placeholder="Sin límite"
            hint="Opcional"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Guardar promoción
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
