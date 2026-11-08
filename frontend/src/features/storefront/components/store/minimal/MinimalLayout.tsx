import { StorePageContent } from '../StorePageContent';
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

      <div className="md:pl-20 min-h-screen flex flex-col">
        <MinimalHeader />

        <main id="main-content" tabIndex={-1} className="flex-1">
          <StorePageContent><Outlet /></StorePageContent>
        </main>

        <MinimalFooter />
      </div>
    </StoreVisualRoot>
  );
}