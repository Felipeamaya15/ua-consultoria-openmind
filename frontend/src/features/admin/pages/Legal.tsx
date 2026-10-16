import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createDefaultLegalPages, legalPageTemplates, LegalPageType } from "../data/mockAdminData";
import { legalSlugs, templatePaths } from "../config/navigation";
import { useAdmin } from "../context/AdminContext";
import { Alert, Badge, Button, Textarea } from "../components/ui";
import {
  LEGAL_MAX_LENGTH,
  LEGAL_STORAGE_ERROR,
  formatLegalDate,
  publishLegalPage,
} from "../../storefront/data/legalPublication";
import { legalService } from "../../storefront/services/legalService";
import { STORE_CONFIG_CHANGED_EVENT } from "../../storefront/visual/storage";

const pageTypes: LegalPageType[] = ["terms", "privacy", "refund", "cookies"];

export default function LegalEditor() {
  const { type = "terms" } = useParams();
  const current: LegalPageType = pageTypes.find((item) => legalSlugs[item] === type) ?? "terms";
  const { config, setConfig } = useAdmin();

  const pages = { ...createDefaultLegalPages(), ...config.legalPages };
  const page = pages[current] ?? createDefaultLegalPages()[current];
  const meta = legalPageTemplates[current] ?? {
    title: "Página Legal",
    description: "Configuración legal de la tienda",
    content: "",
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<"draft" | "published" | "restored" | "error" | null>(null);

  // Sincronización inicial desde el backend en tiempo de ejecución
  useEffect(() => {
    let active = true;
    const loadBackend = async () => {
      try {
        const data = await legalService.fetchAdminLegalPages();
        if (active && data) {
          setConfig({ ...config, legalPages: { ...pages, ...data } });
        }
      } catch {
        // Fallback transparente a la configuración local
      }
    };
    void loadBackend();
    return () => {
      active = false;
    };
  }, []);

  const hasUnpublishedChanges = page.draft !== page.published;
  const wordCount = useMemo(
    () => (page.draft.trim() ? page.draft.trim().split(/\s+/).length : 0),
    [page.draft],
  );

  const updateDraft = (draft: string) => {
    setConfig({
      ...config,
      legalPages: { ...pages, [current]: { ...page, draft } },
    });
    setNotice(null);
    setError("");
  };

  const handleRestore = async () => {
    const content = legalPageTemplates[current]?.content || "";
    setConfig({
      ...config,
      legalPages: { ...pages, [current]: { ...page, draft: content } },
    });
    setNotice("restored");
    setError("");
    try {
      await legalService.restore(current);
    } catch {
      // Ignorar error si no hay conexión al backend
    }
  };

  const handleSaveDraft = async () => {
    setNotice("draft");
    setError("");
    try {
      await legalService.saveDraft(current, page.draft);
    } catch {
      // Ignorar error de red para conservar borrador en navegador
    }
  };

  const handlePublish = async () => {
    const result = publishLegalPage(pages, current);
    if (!result.ok) {
      setError(result.error);
      setNotice("error");
      return;
    }

    const savedOk = setConfig({ ...config, legalPages: result.pages });
    if (savedOk === false) {
      setError(LEGAL_STORAGE_ERROR);
      setNotice("error");
      return;
    }

    setError("");
    setNotice("published");

    // Notificar al backend y a la tienda pública
    setSaving(true);
    try {
      await legalService.publish(current, page.draft);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(STORE_CONFIG_CHANGED_EVENT));
      }
    } catch {
      // Si falla la red, la publicación local ya quedó guardada
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
        <Badge variant={hasUnpublishedChanges ? "warning" : "success"}>
          {hasUnpublishedChanges ? "Cambios sin publicar" : "Publicada"}
        </Badge>
      </div>

      <Alert variant="info">
        Lo que publiques es lo que ven tus clientes en la tienda; el borrador no se muestra hasta que lo publiques. Por ahora la publicación se guarda en este navegador, igual que el resto de la personalización de tu tienda.
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
            {legalPageTemplates[item]?.title ?? item}
            {pages[item]?.draft !== pages[item]?.published && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </Link>
        ))}
      </nav>

      {notice === "error" && <Alert variant="error">{error}</Alert>}
      {notice && notice !== "error" && (
        <Alert variant="success">
          {notice === "draft"
            ? "Borrador guardado. Todavía no es visible en la tienda."
            : notice === "published"
            ? "Página publicada. Tus clientes ya ven esta versión en la tienda."
            : "Se restauró la plantilla base en el borrador."}
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
            maxLength={LEGAL_MAX_LENGTH}
            className="font-mono text-xs leading-relaxed"
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleRestore}>
              Restaurar plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveDraft}>
              Guardar borrador
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={!hasUnpublishedChanges || saving}
            >
              Publicar
            </Button>
          </div>
        </section>

        <section className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Versión publicada</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-black border border-neutral-300 bg-transparent">
                  v{page.version || 1} • Vigente
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Es la versión que ven tus clientes{formatLegalDate(page.lastPublished) ? ` · actualizada el ${formatLegalDate(page.lastPublished)}` : ""}.
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
