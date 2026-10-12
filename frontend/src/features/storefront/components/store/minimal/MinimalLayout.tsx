import { StorePageContent } from '../StorePageContent';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { MinimalSidebar } from './MinimalSidebar';
import { MinimalHeader } from './MinimalHeader';
import { MinimalFooter } from './MinimalFooter';
import { StoreVisualRoot } from '../StoreVisualRoot';

export function MinimalLayout() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return (
    <StoreVisualRoot className="template-minimal min-h-screen bg-[#f5f5f3]">

      <MinimalSidebar />

      <div className="md:pl-16 min-h-screen flex flex-col">

        <div data-visual-section={VISUAL_SECTION.topBar} data-institutional-bar className="bg-[var(--institutional)] text-white py-2 px-4 text-xs flex items-center justify-center gap-2.5 font-medium"><InstitutionalBadge /></div>

        <MinimalHeader />

        <main className="flex-1">
          <StorePageContent><Outlet /></StorePageContent>
        </main>

        <MinimalFooter />

      </div>
    </StoreVisualRoot>
  );
}
