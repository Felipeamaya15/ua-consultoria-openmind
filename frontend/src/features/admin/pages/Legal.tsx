import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import { Link, useParams } from 'react-router-dom';
import { createDefaultLegalPages, legalPageTemplates, type LegalPageType } from '../data/mockAdminData';
import { legalSlugs, templatePaths } from '../config/navigation';
import { useAdmin } from '../context/AdminContext';
import { Alert, Badge, Button, Textarea } from '../components/ui';
import { LEGAL_MAX_LENGTH, formatLegalDate } from '../../storefront/data/legalPublication';
import { legalService } from '../../storefront/services/legalService';
import type { LegalPage, LegalType } from '../../storefront/data/legalContent';
import { useVerifiedLegalScope } from '../../storefront/hooks/useVerifiedLegalScope';
import { getStoreConfigKey, STORE_CONFIG_CHANGED_EVENT } from '../../storefront/visual/storage';

const pageTypes: LegalPageType[] = ['terms', 'privacy', 'refund', 'cookies'];
export default function LegalEditor() {
  const session = useVerifiedLegalScope();
  if (!session.ready) return <p role={session.error ? 'alert' : 'status'}>{session.error || 'Confirmando tienda y sesión...'}</p>;
  if (!session.owner) return <p role="alert">Inicia sesión como propietario para administrar las páginas legales.</p>;
  return <ScopedLegalEditor key={session.key} isCurrent={session.isCurrent} storageKey={getStoreConfigKey(session.identity!)} />;
}
function ScopedLegalEditor({ isCurrent, storageKey }: { isCurrent: () => boolean; storageKey: string }) {
  const { type = 'terms' } = useParams();
  const current: LegalPageType = pageTypes.find(item => legalSlugs[item] === type) ?? 'terms';
  const { config } = useAdmin();
  const [pages, setPages] = useState<Record<LegalType, LegalPage>>(createDefaultLegalPages);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<'draft' | 'published' | 'restored' | 'recovered' | 'error' | null>(null);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const selected = useRef(current); selected.current = current;
  useEffect(() => {
    const controller = new AbortController(); pending.current = controller; alive.current = true;
    legalService.fetchAdminLegalPages(controller.signal).then(data => { if (alive.current && isCurrent()) setPages(data); })
      .catch(() => { if (alive.current && isCurrent()) { setLoadFailed(true); setError('No pudimos cargar el contenido legal del servidor. Recarga para reintentar.'); setNotice('error'); } })
      .finally(() => { if (alive.current && isCurrent()) setLoading(false); });
    return () => { alive.current = false; pending.current?.abort(); };
  }, []);
  const page = pages[current];
  const meta = legalPageTemplates[current];
  const hasUnpublishedChanges = page.draft !== page.published;
  const wordCount = useMemo(() => page.draft.trim() ? page.draft.trim().split(/\s+/).length : 0, [page.draft]);
  const updateDraft = (draft: string) => { setPages(previous => ({ ...previous, [current]: { ...previous[current], draft } })); setNotice(null); setError(''); };
  async function perform(action: 'draft' | 'published' | 'restored', historicContent?: string) {
    if (busy.current || loading || loadFailed || !isCurrent()) return;
    const target = current;
    const text = historicContent ?? page.draft;
    if (action === 'published' && (!text.trim() || text.length > LEGAL_MAX_LENGTH)) { setError('Escribe un contenido válido antes de publicar.'); setNotice('error'); return; }
    busy.current = true; setSaving(true); setNotice(null); setError('');
    const controller = new AbortController(); pending.current = controller;
    try {
      const data = action === 'published' ? await legalService.publish(target, text, controller.signal)
        : action === 'restored' && historicContent === undefined ? await legalService.restore(target, controller.signal)
        : await legalService.saveDraft(target, text, undefined, undefined, controller.signal);
      if (!alive.current || !isCurrent()) return;
      // Solo reemplaza la página que guardó; no descarta ediciones de otra pestaña legal.
      setPages(previous => ({ ...previous, [target]: data[target] }));
      if (selected.current === target) setNotice(historicContent !== undefined ? 'recovered' : action);
      if (action === 'published') window.dispatchEvent(new CustomEvent(STORE_CONFIG_CHANGED_EVENT, { detail: { storageKey } }));
    } catch {
      if (alive.current && isCurrent()) { setError('No pudimos guardar en el servidor. Conservamos tu edición y la versión publicada. Intenta nuevamente.'); setNotice('error'); }
    } finally { busy.current = false; if (alive.current && isCurrent()) setSaving(false); }
  }
  const handleRestore = () => perform('restored');
  const handleSaveDraft = () => perform('draft');
  const handlePublish = () => perform('published');
  if (loading) return <LoadingState align="start" spacing="compact">Cargando contenido legal del servidor...</LoadingState>;
  if (loadFailed) return <ErrorState>{humanizeAdminError(error)}</ErrorState>;
  return (
    <div className="w-full space-y-5">
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
        Lo que publiques es lo que ven tus clientes en la tienda; el borrador no se muestra hasta que lo publiques. La publicación y su historial se confirman y guardan en el servidor de tu tienda.
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
            : notice === "recovered"
            ? "Se recuperó la versión elegida como borrador."
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
            disabled={saving || loadFailed}
            rows={20}
            maxLength={LEGAL_MAX_LENGTH}
            className="font-mono text-xs leading-relaxed"
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleRestore} disabled={saving || loadFailed}>
              Restaurar plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving || loadFailed}>
              Guardar borrador
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={!hasUnpublishedChanges || saving || loadFailed}
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

          {!!page.historial?.length && <details className="my-4"><summary>Historial publicado</summary><ul>{page.historial.map(entry => <li key={entry.version}>Versión {entry.version} · {formatLegalDate(entry.fecha_vigencia)} <Button size="sm" variant="outline" disabled={saving || loadFailed} onClick={() => void perform('restored', entry.content)}>Recuperar como borrador</Button></li>)}</ul></details>}
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