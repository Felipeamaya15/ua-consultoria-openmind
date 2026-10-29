import { StorePageContent } from '../StorePageContent';
import { Outlet } from 'react-router-dom';
import { CatalogHeader } from './CatalogHeader';
import { CatalogFooter } from './CatalogFooter';
import { StoreVisualRoot } from '../StoreVisualRoot';

export function CatalogLayout() {
  return (
       <StoreVisualRoot className="template-catalog min-h-screen bg-[#050505] text-white flex flex-col">
      <CatalogHeader />
      <main className="flex-1">
        <StorePageContent><Outlet /></StorePageContent>
      </main>
      <CatalogFooter />
    </StoreVisualRoot>
  );
}
