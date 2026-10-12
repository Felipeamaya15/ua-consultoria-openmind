import { StorePageContent } from '../StorePageContent';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { Outlet } from 'react-router-dom';
import { CatalogHeader } from './CatalogHeader';
import { CatalogFooter } from './CatalogFooter';
import { StoreVisualRoot } from '../StoreVisualRoot';

export function CatalogLayout() {
  return (
       <StoreVisualRoot className="template-catalog min-h-screen bg-[#050505] text-white flex flex-col">
      <div data-visual-section={VISUAL_SECTION.topBar} data-institutional-bar className="bg-[var(--institutional)] text-white py-2 px-4 text-xs flex items-center justify-center gap-2.5 font-medium"><InstitutionalBadge /></div>
      <CatalogHeader />
      <main className="flex-1">
        <StorePageContent><Outlet /></StorePageContent>
      </main>
      <CatalogFooter />
    </StoreVisualRoot>
  );
}
