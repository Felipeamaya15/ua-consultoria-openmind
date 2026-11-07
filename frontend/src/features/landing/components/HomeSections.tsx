import { Fragment, type ReactNode } from 'react';
import { useStore } from '../../storefront/context/StoreContext';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { homeSectionOrder, systemSectionVisible, type SystemSectionId } from '../types/homeSections';
import { LandingBlocks } from './LandingBlocks';
import { PublishedSectionMedia } from './SectionElements';
import { blockStyleSheet } from '../../storefront/visual/blockAppearance';

/** Templates provide their existing commerce markup; this is the single ordering boundary. */
export function HomeSections({ commerce }: { commerce: Partial<Record<SystemSectionId, ReactNode>> }) {
  const {landing, blockStyles} = useStore();
  const {template} = useStorefrontTemplate();
  const content = <><style data-block-appearance>{blockStyleSheet(blockStyles)}</style>{homeSectionOrder(landing?.contenido, template).map(id=>{
    if (id.startsWith('sistema:')) return systemSectionVisible(id as SystemSectionId, landing?.secciones)
      ? <Fragment key={id}>{commerce[id as SystemSectionId]}</Fragment> : null;
    return <LandingBlocks key={id} blockId={id} mediaProvided />;
  })}</>;
  return landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='personalizada') ? <PublishedSectionMedia>{content}</PublishedSectionMedia> : content;
}
