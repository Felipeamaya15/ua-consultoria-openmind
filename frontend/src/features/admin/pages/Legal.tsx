import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { createDefaultLegalPages, legalPageTemplates, LegalPageType } from "../data/mockAdminData"
import { legalSlugs, templatePaths } from "../config/navigation";
import { useAdmin } from "../context/AdminContext"
import { Alert, Badge, Button, Textarea } from "../components/ui"

const pageTypes: LegalPageType[] = ["terms", "privacy", "refund"]

export default function LegalEditor() {
  const { type = "terms" } = useParams()
  const current: LegalPageType = pageTypes.find(item => legalSlugs[item] === type) ?? "terms"
  const { config, setConfig } = useAdmin()
  const pages = config.legalPages ?? createDefaultLegalPages()
  const page = pages[current]
  const meta = legalPageTemplates[current]
  const [notice, setNotice] = useState<"draft" | "published" | "restored" | null>(null)
  const hasUnpublishedChanges = page.draft !== page.published
  const wordCount = useMemo(() => page.draft.trim() ? page.draft.trim().split(/\s+/).length : 0, [page.draft])
  const updateDraft = (draft: string) => setConfig({ ...config, legalPages: { ...pages, [current]: { ...page, draft } } })
  const restore = () => { const content = legalPageTemplates[current].content; setConfig({ ...config, legalPages: { ...pages, [current]: { ...page, draft: content } } }); setNotice("restored") }
  const saveDraft = () => setNotice("draft")
  const publish = () => { setConfig({ ...config, legalPages: { ...pages, [current]: { ...page, published: page.draft, lastPublished: new Date().toISOString() } } }); setNotice("published") }
  return <div className="max-w-5xl space-y-5">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><h2 className="font-semibold text-xl">{meta.title}</h2><p className="text-sm text-[var(--muted-foreground)] mt-1">{meta.description}</p></div><Badge variant={hasUnpublishedChanges ? "warning" : "success"}>{hasUnpublishedChanges ? "Cambios sin publicar" : "Publicado"}</Badge></div>
    <Alert variant="info">El contenido se guarda en este panel demo. Las páginas actuales de la tienda conservan su contenido hasta conectar el backend.</Alert>
    <nav className="flex gap-2 overflow-x-auto border-b border-[var(--border)]" aria-label="Páginas legales">{pageTypes.map((item) => <Link key={item} to={`/emprendedor/legal/${legalSlugs[item]}`} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${item === current ? "border-[var(--primary)] text-[var(--primary)] font-semibold" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{legalPageTemplates[item].title}{pages[item].draft !== pages[item].published && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}</Link>)}</nav>
    {notice && <Alert variant="success">{notice === "draft" ? "Borrador guardado." : notice === "published" ? "Versión demo publicada. La conexión con la tienda se realizará al integrar el backend." : "Se restauró la plantilla base en el borrador."}</Alert>}
    <div className="grid lg:grid-cols-2 gap-5"><section className="bg-white border border-[var(--border)] rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-sm">Editor</p><p className="text-xs text-[var(--muted-foreground)]">Usa **texto** para títulos destacados.</p></div><span className="text-xs text-[var(--muted-foreground)]">{wordCount} palabras</span></div><Textarea aria-label={`Editar ${meta.title}`} value={page.draft} onChange={(event) => updateDraft(event.target.value)} rows={20} className="font-mono text-xs leading-relaxed" /><div className="flex flex-wrap gap-2 pt-1"><Button variant="ghost" size="sm" onClick={restore}>Restaurar plantilla</Button><Button variant="outline" size="sm" onClick={saveDraft}>Guardar borrador</Button><Button variant="primary" size="sm" onClick={publish} disabled={!hasUnpublishedChanges}>Publicar</Button></div></section><section className="bg-white border border-[var(--border)] rounded-2xl p-5"><div className="flex items-center justify-between mb-4"><div><p className="font-semibold text-sm">Vista previa publicada</p><p className="text-xs text-[var(--muted-foreground)]">Versión publicada en el panel demo.</p></div><Link to={`${templatePaths[config.template]}/legal/${current}`} target="_blank" className="text-xs font-semibold text-[var(--primary)] hover:underline">Ver en tienda ↗</Link></div><article className="text-sm text-[var(--muted-foreground)] leading-relaxed">{page.published.split("\n\n").map((paragraph, index) => paragraph.startsWith("**") ? <h3 key={index} className="text-sm font-semibold text-[var(--foreground)] mt-5 mb-2">{paragraph.replace(/\*\*/g, "")}</h3> : <p key={index} className="mb-3">{paragraph}</p>)}</article></section></div>
  </div>
}
