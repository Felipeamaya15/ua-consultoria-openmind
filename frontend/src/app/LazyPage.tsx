import { lazy, Suspense, type ComponentType } from 'react';

/** Route-local boundary keeps layouts and providers mounted while a page chunk loads. */
export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load);
  return function LazyPage() {
    return <Suspense fallback={<p role="status" className="p-6">Cargando página…</p>}><Page /></Suspense>;
  };
}
