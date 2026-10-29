import { StorePageContent } from '../StorePageContent';
import { Outlet } from 'react-router-dom';

import { VisualHeader } from './VisualHeader';
import { VisualCTA } from './VisualCTA';
import { VisualFooter } from './VisualFooter';
import { StoreVisualRoot } from '../StoreVisualRoot';

export function VisualLayout() {
  return (
    <StoreVisualRoot className="template-visual min-h-screen bg-white text-[#111111] flex flex-col">
      <VisualHeader />

      <main className="flex-1">
        <StorePageContent>
          <Outlet />
        </StorePageContent>
      </main>

      <VisualCTA />
      <VisualFooter />
    </StoreVisualRoot>
  );
}