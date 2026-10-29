import { loadVisualFonts } from '../../visual/fontLibrary';
import { VISUAL_SECTION } from '../../visual/sectionIds';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from '../../context/StoreContext';
import { visualConfigToCssVariables } from '../../visual/cssVariables';

export function StoreVisualRoot({ className, children }: { className: string; children: ReactNode }) {
  const { visualConfig } = useStore();
  useEffect(() => loadVisualFonts(visualConfig, document), [visualConfig]);
  const style = useMemo(() => visualConfigToCssVariables(visualConfig), [visualConfig]);
  return <div data-visual-section={VISUAL_SECTION.global} data-storefront-visual className={className} style={style}>{children}</div>;
}
