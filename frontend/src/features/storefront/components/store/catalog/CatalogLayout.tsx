import { Outlet } from 'react-router-dom';
import { CatalogHeader } from './CatalogHeader';
import { CatalogFooter } from './CatalogFooter';

export function CatalogLayout() {
  return (
       <div className="template-catalog min-h-screen bg-[#050505] text-white flex flex-col">
      <div className="bg-[var(--institutional)] text-white py-2 px-4 text-xs flex items-center justify-center gap-2.5 font-medium">
        <img
          src="/logo-universidad-autonoma.png"
          alt="Logo Universidad Autónoma de Chile"
          className="w-8 h-8 object-contain bg-white rounded-md p-1 shadow-sm"
        />
        <span>
          Plataforma impulsada por <strong>Universidad Autónoma de Chile</strong>
        </span>
      </div>
      <CatalogHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <CatalogFooter />
    </div>
  );
}
