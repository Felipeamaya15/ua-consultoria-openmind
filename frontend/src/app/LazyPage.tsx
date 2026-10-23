import { lazy, Suspense, type ComponentType } from 'react';
import { LoadingState } from '../shared/components/states';

/** Route-local boundary keeps layouts and providers mounted while a page chunk loads. */
export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load);
  return function LazyPage() {
    return <Suspense fallback={<LoadingState spacing="none" className="p-6">Cargando página…</LoadingState>}><Page /></Suspense>;
  };
}
