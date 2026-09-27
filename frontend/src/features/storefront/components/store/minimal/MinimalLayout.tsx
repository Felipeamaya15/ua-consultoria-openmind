import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { MinimalSidebar } from './MinimalSidebar';
import { MinimalHeader } from './MinimalHeader';
import { MinimalFooter } from './MinimalFooter';

export function MinimalLayout() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return (
    <div className="template-minimal min-h-screen bg-[#f5f5f3]">

      <MinimalSidebar />

      <div className="md:pl-16 min-h-screen flex flex-col">

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

        <MinimalHeader />

        <main className="flex-1">
          <Outlet />
        </main>

        <MinimalFooter />

      </div>
    </div>
  );
}