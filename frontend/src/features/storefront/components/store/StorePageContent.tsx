import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { pageFromPath, isStorefrontEditorPreview } from '../../visual/pages';
import { VISUAL_SECTION } from '../../visual/sectionIds';
import { isActiveEditorPreview } from '../../visual/pages';
import { EditorPageExample, EXAMPLE_PAGES } from './EditorPageExample';

/** The existing page keeps its state, handlers, validation and route guards. */
export function StorePageContent({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const examplePage = pageFromPath(pathname);
  const safeExample = isActiveEditorPreview() && new URLSearchParams(search).get('visualExample') === '1' && examplePage && EXAMPLE_PAGES.includes(examplePage);
  const page = safeExample && examplePage === 'checkout' && new URLSearchParams(search).get('visualStep') === 'confirm' ? 'confirmation' : examplePage;
  let example = false;
  try { example = page === 'confirmation' && isStorefrontEditorPreview(window.parent !== window, window.parent.location.pathname); } catch { /* Public pages keep their real data. */ }
  // Catalog already owns its grid, cards, title and filter contract.
  return page && page !== 'catalog' ? <div className="ua-store-page" data-visual-section={VISUAL_SECTION.pageLayout} data-visual-page={page}>{safeExample ? <EditorPageExample page={page} search={search} /> : <>{example && <p role="note">Vista previa de diseño · Pedido de ejemplo, sin compra realizada.</p>}{children}</>}</div> : <>{children}</>;
}
