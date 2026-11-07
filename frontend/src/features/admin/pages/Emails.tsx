import { AutomaticFieldEditor, previewFields, validateAutomaticFields, type AutomaticField } from '../components/AutomaticFieldEditor';
import { useEffect, useRef, useState } from "react"
import { useAdmin } from "../context/AdminContext"
import {
  createDefaultEmailTemplates,
  emailTemplateDefinitions,
  EmailTemplateType,
} from "../data/mockAdminData"
import { Alert, Button, Toggle } from "../components/ui"
import { fetchEmailTemplates, saveEmailTemplates, sendEmergencyEmail, type RemoteEmailTemplates } from "../services/emailTemplateService"

const templateTypes = Object.keys(emailTemplateDefinitions) as EmailTemplateType[]


export default function EmailTemplates() {
  const { config, setConfig } = useAdmin()
  const defaults = createDefaultEmailTemplates()
  const [templates, setTemplates] = useState(() => {
    const defs = createDefaultEmailTemplates()
    const stored = (config.emailTemplates ?? {}) as Partial<typeof defs>
    return Object.fromEntries(
      (Object.keys(defs) as EmailTemplateType[]).map((type) => [
        type,
        {
          ...defs[type],
          ...(stored[type] ?? {}),
        },
      ])
    ) as typeof defs
  })
  const [activeType, setActiveType] = useState<EmailTemplateType>("order_received")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [remoteDefaults, setRemoteDefaults] = useState<RemoteEmailTemplates["por_defecto"]>({})
  const [fields,setFields] = useState<AutomaticField[]>([])
  const [required,setRequired] = useState<Record<string,string[]>>({})
  const [emergencyOpen, setEmergencyOpen] = useState(false)
  const [emergencyRecipient, setEmergencyRecipient] = useState('')
  const [emergencyOrderId, setEmergencyOrderId] = useState('')
  const [emergencySending, setEmergencySending] = useState(false)
  const [emergencyResult, setEmergencyResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleEmergencySend = async () => {
    if (emergencySending) return
    setEmergencySending(true)
    setEmergencyResult(null)
    try {
      const res = await sendEmergencyEmail({
        tipo: activeType,
        destinatario: emergencyRecipient.trim() || undefined,
        id_pedido: emergencyOrderId.trim() ? Number(emergencyOrderId.trim()) : undefined,
      })
      setEmergencyResult({
        type: 'success',
        text: `Correo de emergencia enviado exitosamente a ${res.destinatario || emergencyRecipient.trim()}.`,
      })
    } catch (err) {
      setEmergencyResult({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo enviar el correo de emergencia.',
      })
    } finally {
      setEmergencySending(false)
    }
  }
  const activeTemplate = templates[activeType] ?? defaults[activeType] ?? {
    enabled: true,
    subject: '',
    preheader: '',
    body: '',
  }

  const updateTemplate = (changes: Partial<typeof activeTemplate>) => {
    if (savingRef.current) return
    setTemplates((current) => ({
      ...current,
      [activeType]: { ...(current[activeType] ?? defaults[activeType]), ...changes },
    }))
    setSaved(false)
  }


  useEffect(() => {
    let active = true
    fetchEmailTemplates()
      .then((remote) => {
        if (!active) return
        setRemoteDefaults(remote.por_defecto)
        setFields(remote.variables??[])
        setRequired(remote.obligatorias??{})
        setTemplates((current) => {
          const defs = createDefaultEmailTemplates()
          const remotePlantillas = (remote.plantillas ?? {}) as Partial<typeof defs>
          return Object.fromEntries(
            (Object.keys(defs) as EmailTemplateType[]).map((type) => [
              type,
              {
                ...defs[type],
                ...(current[type] ?? {}),
                ...(remotePlantillas[type] ?? {}),
              },
            ])
          ) as typeof defs
        })
        setLoaded(true)
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las plantillas.") })
    return () => { active = false }
  }, [])

  const save = async () => {
    if (savingRef.current || !loaded) return
    savingRef.current = true
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const remoteTypes = Object.keys(remoteDefaults)
      if (!remoteTypes.length) throw new Error('No pudimos confirmar las plantillas disponibles. Recarga antes de guardar.')
      if(!fields.length) throw new Error('No pudimos cargar los campos automáticos. Recarga antes de guardar.')
      for(const type of remoteTypes){const template=templates[type as EmailTemplateType] ?? defaults[type as EmailTemplateType];const message=validateAutomaticFields([template.subject,template.preheader,template.body],fields,template.enabled?required[type]??[]:[]);if(message){setActiveType(type as EmailTemplateType);throw new Error(message)}}
      const toSave = Object.fromEntries(remoteTypes.map((type) => [type, templates[type as EmailTemplateType] ?? defaults[type as EmailTemplateType]]))
      await saveEmailTemplates(toSave)
      if (setConfig({ ...config, emailTemplates: templates })) setSaved(true)
      else setError('Las plantillas se guardaron en el servidor, pero no se pudo actualizar la copia del navegador.')
    } catch (reason) {
      setSaved(false)
      setError(reason instanceof Error ? reason.message : "No se pudieron guardar las plantillas.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const restoreSelected = () => {
    const allDefaults = { ...createDefaultEmailTemplates(), ...remoteDefaults } as typeof templates
    setTemplates((current) => ({ ...current, [activeType]: allDefaults[activeType] }))
    setSaved(false)
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <Alert variant="info" title="Envío automático">
        Estos mensajes se envían solos al comprador según el estado del pedido: «Pendiente», «Pagado/En preparación», «En camino», «Entregado» y «Cancelado». Puedes desactivar o editar el que prefieras.
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
        <aside className="bg-white border border-[var(--border)] rounded-2xl p-3 h-fit">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Eventos de correo</p>
          <div className="space-y-1">
            {templateTypes.map((type) => {
              const definition = emailTemplateDefinitions[type]
              const template = templates[type] ?? defaults[type]
              const isEnabled = Boolean(template?.enabled)
              const selected = type === activeType
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${selected ? "bg-[var(--secondary)] text-[var(--primary)]" : "hover:bg-[var(--muted)]"}`}
                >
                  <span className="block text-sm font-semibold">{definition.label}</span>
                  <span className="block text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{definition.description}</span>
                  <span className={`inline-block mt-2 text-[11px] font-medium ${isEnabled ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`}>
                    {isEnabled ? "Activo" : "Desactivado"}
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
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Destino automático: <span className="font-mono"><span className="automatic-field-chip">Correo del cliente</span></span></p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || !loaded}
                  onClick={() => { setEmergencyOpen(!emergencyOpen); setEmergencyResult(null); }}
                >
                  {emergencyOpen ? 'Cerrar envío manual' : 'Envío manual'}
                </Button>
                <Toggle
                disabled={saving || !loaded}
                label="Activar envío automático"
                checked={activeTemplate.enabled}
                onChange={(enabled) => updateTemplate({ enabled })}
                />
              </div>
            {emergencyOpen && (
              <div className="p-4 bg-[var(--muted)]/50 border border-[var(--border)] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
                    Envío manual de emergencia — {emailTemplateDefinitions[activeType].label}
                  </h3>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Omite filtros automáticos y envía de inmediato
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                      Correo destinatario (opcional si indicas pedido)
                    </label>
                    <input
                      type="email"
                      placeholder="cliente@gmail.com, outlook, hotmail, etc."
                      value={emergencyRecipient}
                      onChange={e => setEmergencyRecipient(e.target.value)}
                      disabled={emergencySending}
                      className="w-full text-xs px-3 py-2 bg-white border border-[var(--border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                      N° o ID de pedido (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 12 (deja vacío para último pedido)"
                      value={emergencyOrderId}
                      onChange={e => setEmergencyOrderId(e.target.value)}
                      disabled={emergencySending}
                      className="w-full text-xs px-3 py-2 bg-white border border-[var(--border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Compatible con Gmail, Outlook, Hotmail y demás proveedores.
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={emergencySending}
                    onClick={handleEmergencySend}
                  >
                    {emergencySending ? 'Enviando correo…' : 'Enviar correo ahora'}
                  </Button>
                </div>
                {emergencyResult && (
                  <Alert variant={emergencyResult.type === 'success' ? 'success' : 'error'}>
                    {emergencyResult.text}
                  </Alert>
                )}
              </div>
            )}
            </div>
            <div className="grid gap-4">
              <AutomaticFieldEditor key={activeType+'-subject'} label="Asunto" value={activeTemplate.subject} onChange={subject=>updateTemplate({subject})} fields={fields} required={activeTemplate.enabled?required[activeType]:[]} maxLength={200} disabled={saving||!loaded||!activeTemplate.enabled}/>
              <AutomaticFieldEditor key={activeType+'-preheader'} label="Texto de vista previa" value={activeTemplate.preheader} onChange={preheader=>updateTemplate({preheader})} fields={fields} required={activeTemplate.enabled?required[activeType]:[]} maxLength={200} disabled={saving||!loaded||!activeTemplate.enabled}/>
              <AutomaticFieldEditor key={activeType+'-body'} label="Contenido del correo" value={activeTemplate.body} onChange={body=>updateTemplate({body})} fields={fields} required={activeTemplate.enabled?required[activeType]:[]} multiline disabled={saving||!loaded||!activeTemplate.enabled}/>
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold mb-3">Campos automáticos</h3>
              <p className="text-xs text-[var(--muted-foreground)] mb-4">Se completan con los datos del pedido. Número de pedido es obligatorio en cada correo activo. Los demás campos pueden quitarse; el texto que los rodea es totalmente personalizable.</p>
              <div className="automatic-field-help">{fields.map(field=><div key={field.key}><strong>{field.label}{required[activeType]?.includes(field.key)?' · Obligatorio':''}</strong><p>{field.description}</p></div>)}</div>
            </div>
          </section>

          <section className="bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-semibold text-sm">Vista previa</h2>
              <span className="text-xs text-[var(--muted-foreground)]">Vista previa con datos de ejemplo.</span>
            </div>
            <div className="p-5 bg-[var(--muted)]/40">
              <div className="max-w-xl mx-auto bg-white border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)]">De: {config.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Para: cliente@example.test</p>
                  <p className="font-semibold mt-3">{previewFields(activeTemplate.subject,fields) || "Sin asunto"}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">{previewFields(activeTemplate.preheader,fields)}</p>
                </div>
                <div className="p-5 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
                  {previewFields(activeTemplate.body,fields) || "Escribe el contenido de este correo."}
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            <Button variant="outline" disabled={saving || !loaded} onClick={restoreSelected}>Restaurar plantilla</Button>
            <Button variant="primary" disabled={saving || !loaded} onClick={save}>{saving ? 'Guardando…' : 'Guardar correos automáticos'}</Button>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          {saved && <Alert variant="success">Plantillas guardadas. Los correos se envían solos al comprador cuando ocurre cada evento.</Alert>}
        </div>
      </div>
    </div>
  )
}
