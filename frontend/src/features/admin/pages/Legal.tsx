import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createDefaultLegalPages, legalPageTemplates, LegalPageType } from "../data/mockAdminData";
import { legalSlugs, templatePaths } from "../config/navigation";
import { useAdmin } from "../context/AdminContext";
import { Alert, Badge, Button, Textarea } from "../components/ui";
import { legalService } from "../../storefront/services/legalService";
import { STORE_CONFIG_CHANGED_EVENT } from "../../storefront/visual/storage";

const pageTypes: LegalPageType[] = ["terms", "privacy", "refund", "cookies"];

export default function LegalEditor() {
  const { type = "terms" } = useParams();
  const current: LegalPageType = pageTypes.find(item => legalSlugs[item] === type) ?? "terms";
  const { config, setConfig } = useAdmin();

  const [pages, setPages] = useState(config.legalPages ?? createDefaultLegalPages());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<"draft" | "published" | "restored" | null>(null);

  // Carga inicial desde el backend
  useEffect(() => {
    let active = true;
    const loadBackendPages = async () => {
      try {
        setLoading(true);
        const data = await legalService.fetchAdminLegalPages();
        if (active) {
          setPages(data);
          setConfig({ ...config, legalPages: data });
          setErrorMessage("");
        }
      } catch (err: any) {
        console.warn("No se pudo cargar la configuración legal desde el backend, usando copia local:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadBackendPages();
    return () => {
      active = false;
    };
  }, []);

  const page = pages[current] ?? createDefaultLegalPages()[current];
  const meta = legalPageTemplates[current];
  const hasUnpublishedChanges = page.draft !== page.published;
  const wordCount = useMemo(() => page.draft.trim() ? page.draft.trim().split(/\s+/).length : 0, [page.draft]);

  const updateDraft = (draft: string) => {
    const updated = { ...pages, [current]: { ...page, draft } };
    setPages(updated);
    setConfig({ ...config, legalPages: updated });
    setNotice(null);
  };

  const handleRestore = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      const updated = await legalService.restore(current);
      setPages(updated);
      setConfig({ ...config, legalPages: updated });
      setNotice("restored");
    } catch (err: any) {
      // Fallback local si falla la red
      const content = legalPageTemplates[current].content;
      const updated = { ...pages, [current]: { ...page, draft: content } };
      setPages(updated);
      setConfig({ ...config, legalPages: updated });
      setNotice("restored");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      const updated = await legalService.saveDraft(current, page.draft);
      setPages(updated);
      setConfig({ ...config, legalPages: updated });
      setNotice("draft");
    } catch (err: any) {
      setErrorMessage(err.message || "Error al guardar el borrador en el servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      const updated = await legalService.publish(current, page.draft);
      setPages(updated);
      setConfig({ ...config, legalPages: updated });
      setNotice("published");

      // Notificar a la tienda pública para refresco reactivo automático
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(STORE_CONFIG_CHANGED_EVENT));
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error al publicar la página legal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-xl">{meta.title}</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">{meta.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-xs text-[var(--muted-foreground)]">Sincronizando...</span>}
          <Badge variant={hasUnpublishedChanges ? "warning" : "success"}>
            {hasUnpublishedChanges ? "Cambios sin publicar" : "Publicado"}
          </Badge>
        </div>
      </div>

      <Alert variant="info">
        Los cambios que publiques se actualizan automáticamente en la página de inicio, en el flujo de compra y en las páginas legales de la tienda.
      </Alert>

      <nav className="flex gap-2 overflow-x-auto border-b border-[var(--border)]" aria-label="Páginas legales">
        {pageTypes.map((item) => (
          <Link
            key={item}
            to={`/emprendedor/legal/${legalSlugs[item]}`}
            className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${
              item === current
                ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {legalPageTemplates[item].title}
            {pages[item]?.draft !== pages[item]?.published && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </Link>
        ))}
      </nav>

      {notice && (
        <Alert variant="success">
          {notice === "draft"
            ? "Borrador guardado correctamente."
            : notice === "published"
            ? `${meta.title} publicado con éxito. Los cambios ya son visibles en la tienda online y en el flujo de compra.`
            : "Se restauró la plantilla base en el borrador."}
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="error">
          {errorMessage}
        </Alert>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="bg-white border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Editor</p>
              <p className="text-xs text-[var(--muted-foreground)]">Usa **texto** para títulos destacados.</p>
            </div>
            <span className="text-xs text-[var(--muted-foreground)]">{wordCount} palabras</span>
          </div>

          <Textarea
            aria-label={`Editar ${meta.title}`}
            value={page.draft}
            onChange={(event) => updateDraft(event.target.value)}
            rows={20}
            className="font-mono text-xs leading-relaxed"
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleRestore} disabled={saving}>
              Restaurar plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving}>
              {saving ? "Guardando..." : "Guardar borrador"}
            </Button>
            <Button variant="primary" size="sm" onClick={handlePublish} disabled={!hasUnpublishedChanges || saving}>
              {saving ? "Publicando..." : "Publicar"}
            </Button>
          </div>
        </section>

        <section className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Versión vigente publicada</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-black border border-neutral-300 bg-transparent">
                  v{page.version || 1} • Vigente
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Versión actualmente visible para compradores{page.lastPublished ? ` (desde ${new Date(page.lastPublished).toLocaleDateString('es-CL')})` : ''}.
              </p>
            </div>
            <Link
              to={`${templatePaths[config.template]}/legal/${current}`}
              target="_blank"
              className="text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Ver en tienda ↗
            </Link>
          </div>

          <article className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            {page.published.split("\n\n").map((paragraph, index) =>
              paragraph.startsWith("**") ? (
                <h3 key={index} className="text-sm font-semibold text-[var(--foreground)] mt-5 mb-2">
                  {paragraph.replace(/\*\*/g, "")}
                </h3>
              ) : (
                <p key={index} className="mb-3">
                  {paragraph}
                </p>
              )
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
