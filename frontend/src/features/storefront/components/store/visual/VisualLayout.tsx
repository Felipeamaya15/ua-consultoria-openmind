import { Outlet } from 'react-router-dom';

import { VisualHeader } from './VisualHeader';
import { VisualBenefits } from './VisualBenefits';
import { VisualCTA } from './VisualCTA';
import { VisualFooter } from './VisualFooter';

export function VisualLayout() {
  return (
      <div className="template-visual min-h-screen bg-white text-[#111111] flex flex-col">
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
      <VisualHeader />

      <main className="flex-1">
        <Outlet />
      </main>

      <VisualBenefits />
      <VisualCTA />
      <VisualFooter />
    </div>
  );
}