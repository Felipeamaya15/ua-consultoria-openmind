import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

function getErrorStoreHeading(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tijax.cl') return 'La Magia de Tijax';
    if (host === 'ecocrespo.cl') return 'EcoCrespo';
  }
  if (typeof document !== 'undefined' && document.title) {
    return document.title.split('|')[0].trim() || 'Tienda Online';
  }
  return 'Tienda Online';
}

export function ErrorFallback() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  if (isNotFound) {
    return <NotFoundPage />;
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-[var(--border,#e5e7eb)] bg-white p-6 sm:p-10 text-center shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground,#6b7280)] mb-2">
          {getErrorStoreHeading()}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--foreground,#111827)] mb-3">
          Ocurrió un problema inesperado al cargar esta sección
        </h1>
        <p className="text-sm sm:text-base text-[var(--muted-foreground,#4b5563)] mb-6">
          No pudimos mostrar este contenido en este momento. Puedes intentar recargar la página o volver a la portada de la tienda.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[var(--primary,#1a3a6b)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Volver a la portada
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-[var(--border,#d1d5db)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--foreground,#111827)] transition hover:bg-gray-50"
          >
            Recargar página
          </button>
        </div>
      </section>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--border,#e5e7eb)] bg-white p-6 sm:p-10 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground,#6b7280)] mb-2">
          Error 404
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--foreground,#111827)] mb-3">
          Página no encontrada
        </h1>
        <p className="text-sm sm:text-base text-[var(--muted-foreground,#4b5563)] mb-6">
          La página que buscas no existe, cambió de dirección o no está disponible temporalmente.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[var(--primary,#1a3a6b)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Volver al inicio
          </Link>
          <Link
            to="/catalogo"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-[var(--border,#d1d5db)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--foreground,#111827)] transition hover:bg-gray-50"
          >
            Ver catálogo
          </Link>
        </div>
      </section>
    </main>
  );
}

export default ErrorFallback;
