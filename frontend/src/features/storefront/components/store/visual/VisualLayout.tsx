import { StorePageContent } from '../StorePageContent';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { useLandingSectionVisibility } from '../../../../landing/hooks/useLandingSectionVisibility';
import { Outlet } from 'react-router-dom';

import { VisualHeader } from './VisualHeader';
import { VisualBenefits } from './VisualBenefits';
import { VisualCTA } from './VisualCTA';
import { VisualFooter } from './VisualFooter';
import { StoreVisualRoot } from '../StoreVisualRoot';

export function VisualLayout() {
  const isSectionVisible = useLandingSectionVisibility();
  return (
      <StoreVisualRoot className="template-visual min-h-screen bg-white text-[#111111] flex flex-col">
      <div data-visual-section={VISUAL_SECTION.topBar} data-institutional-bar className="bg-[var(--institutional)] text-white py-2 px-4 text-xs flex items-center justify-center gap-2.5 font-medium"><InstitutionalBadge /></div>
      <VisualHeader />

      <main className="flex-1">
        <StorePageContent><Outlet /></StorePageContent>
      </main>

      {isSectionVisible('Beneficios') && <VisualBenefits />}
      <VisualCTA />
      <VisualFooter />
    </StoreVisualRoot>
  );
}
