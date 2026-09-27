import { useState } from "react"
import { useAdmin } from "../context/AdminContext"
import {
  createDefaultEmailTemplates,
  emailTemplateDefinitions,
  EmailTemplateType,
} from "../data/mockAdminData"
import { Alert, Button, Input, Textarea, Toggle } from "../components/ui"

const templateTypes = Object.keys(emailTemplateDefinitions) as EmailTemplateType[]

const variables = [
  "{{customerName}}",
  "{{customerEmail}}",
  "{{orderNumber}}",
  "{{orderTotal}}",
  "{{shippingMethod}}",
  "{{carrier}}",
  "{{trackingCode}}",
  "{{storeName}}",
]

export default function EmailTemplates() {
  const { config, setConfig } = useAdmin()
  const [templates, setTemplates] = useState(() => config.emailTemplates ?? createDefaultEmailTemplates())
  const [activeType, setActiveType] = useState<EmailTemplateType>("order_received")
  const [saved, setSaved] = useState(false)
  const activeTemplate = templates[activeType]

  const updateTemplate = (changes: Partial<typeof activeTemplate>) => {
    setTemplates((current) => ({
      ...current,
      [activeType]: { ...current[activeType], ...changes },
    }))
    setSaved(false)
  }

  const save = () => {
    setSaved(setConfig({ ...config, emailTemplates: templates }))
    window.setTimeout(() => setSaved(false), 2600)
  }

  const restoreSelected = () => {
    const defaults = createDefaultEmailTemplates()
    setTemplates((current) => ({ ...current, [activeType]: defaults[activeType] }))
    setSaved(false)
  }

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Correos automáticos</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Personaliza los mensajes que se enviarán a tus clientes durante la compra.
        </p>
      </div>

      <Alert variant="info" title="Diseño preparado para integración">
        Este prototipo guarda las plantillas. Los datos del cliente y del pedido se insertarán desde la base de datos cuando se conecte el servicio de correo.
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
        <aside className="bg-white border border-[var(--border)] rounded-2xl p-3 h-fit">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Eventos de correo</p>
          <div className="space-y-1">
            {templateTypes.map((type) => {
              const definition = emailTemplateDefinitions[type]
              const selected = type === activeType
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${selected ? "bg-[var(--secondary)] text-[var(--primary)]" : "hover:bg-[var(--muted)]"}`}
                >
                  <span className="block text-sm font-semibold">{definition.label}</span>
                  <span className="block text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{definition.description}</span>
                  <span className={`inline-block mt-2 text-[11px] font-medium ${templates[type].enabled ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`}>
                    {templates[type].enabled ? "Activo" : "Desactivado"}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="space-y-5 min-w-0">
          <section className="bg-white border border-[var(--border)] rounded-2xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="font-semibold">{emailTemplateDefinitions[activeType].label}</h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Destino automático: <span className="font-mono">{"{{customerEmail}}"}</span></p>
              </div>
              <Toggle
                label="Activar envío automático"
                checked={activeTemplate.enabled}
                onChange={(enabled) => updateTemplate({ enabled })}
              />
            </div>
            <div className="grid gap-4">
              <Input
                label="Asunto"
                value={activeTemplate.subject}
                onChange={(event) => updateTemplate({ subject: event.target.value })}
                disabled={!activeTemplate.enabled}
              />
              <Input
                label="Texto de vista previa"
                value={activeTemplate.preheader}
                onChange={(event) => updateTemplate({ preheader: event.target.value })}
                hint="Texto breve visible junto al asunto en la bandeja de entrada."
                disabled={!activeTemplate.enabled}
              />
              <Textarea
                label="Contenido del correo"
                value={activeTemplate.body}
                onChange={(event) => updateTemplate({ body: event.target.value })}
                rows={13}
                disabled={!activeTemplate.enabled}
              />
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">Variables disponibles</p>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <code key={variable} className="rounded-md bg-[var(--muted)] px-2 py-1 text-xs text-[var(--foreground)]">{variable}</code>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-semibold text-sm">Vista previa</h2>
              <span className="text-xs text-[var(--muted-foreground)]">Los campos del cliente se completan al enviar</span>
            </div>
            <div className="p-5 bg-[var(--muted)]/40">
              <div className="max-w-xl mx-auto bg-white border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)]">De: {config.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Para: <span className="font-mono">{"{{customerEmail}}"}</span></p>
                  <p className="font-semibold mt-3">{activeTemplate.subject || "Sin asunto"}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">{activeTemplate.preheader}</p>
                </div>
                <div className="p-5 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
                  {activeTemplate.body || "Escribe el contenido de este correo."}
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            <Button variant="outline" onClick={restoreSelected}>Restaurar plantilla</Button>
            <Button variant="primary" onClick={save}>Guardar correos automáticos</Button>
          </div>
          {saved && <Alert variant="success">Plantillas guardadas. Quedarán listas para ser enviadas cuando se conecte el servicio de correo.</Alert>}
        </div>
      </div>
    </div>
  )
}
