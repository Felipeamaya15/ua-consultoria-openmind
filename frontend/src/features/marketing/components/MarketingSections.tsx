import { useEffect, useId, useState, type ReactNode } from 'react';
import { Tabs } from '../../admin/components/ui';
import { AdminHelp } from '../../admin/components/AdminPageHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { CampaignWorkspace } from '../../admin/components/CampaignWorkspace';
import { MediaLibrary } from './MediaLibrary';
import { Sharing } from './Sharing';
import type { SharingItem } from '../domain/sharing';
import type { PublicationFormat } from '../domain/types';
import type { MarketingProduct } from '../domain/types';
import type { CatalogSelection, CatalogStatus } from './CatalogMedia';

const sections = [
  { id: 'publications', label: 'Publicaciones' },
  { id: 'media', label: 'Biblioteca multimedia' },
  { id: 'sharing', label: 'Difusión' },
  { id: 'campaigns', label: 'Campañas' },
];

/** Keep the workspace mounted: changing sections never discards its draft/history. */
export function MarketingSections({ children, busy = false, isCurrent, onMediaDirty, onCampaignDirty, home='', onSharingDirty=()=>{}, onPrepare, products, catalogStatus, onSelectProduct, onUseImage }: { children: ReactNode; busy?: boolean; isCurrent: () => boolean; onCampaignDirty: (dirty: boolean) => void; onMediaDirty: (dirty: boolean) => void; home?:string; onSharingDirty?:(dirty:boolean)=>void; onPrepare?:(item:SharingItem,format:PublicationFormat)=>Promise<boolean>; products?: MarketingProduct[]; catalogStatus?: CatalogStatus; onSelectProduct?: (selection: CatalogSelection) => boolean; onUseImage?: (id: string) => Promise<boolean> }) {
  const location = useLocation(), navigate = useNavigate();
  const sectionFromHash = (hash:string) => hash === '#campanas' ? 'campaigns' : hash === '#difusion' ? 'sharing' : hash === '#biblioteca' ? 'media' : 'publications';
  const [active, setActive] = useState(() => sectionFromHash(location.hash));
  const [campaignMounted, setCampaignMounted] = useState(() => active === 'campaigns');
  useEffect(() => { const next=sectionFromHash(location.hash);setActive(next);if(next==='campaigns')setCampaignMounted(true); }, [location.hash]);
  useEffect(() => { if(location.hash==='#redes-sociales')navigate('/emprendedor/landing#contacto-horarios',{replace:true}); }, [location.hash,navigate]);
  const changeSection = (next:string) => {
    setActive(next); if(next==='campaigns')setCampaignMounted(true);
    const hash=next==='campaigns'?'#campanas':next==='sharing'?'#difusion':next==='media'?'#biblioteca':'';
    navigate({pathname:location.pathname,search:location.search,hash},{replace:true});
  };
  const id = useId();
  const openPublications = () => {
    changeSection('publications');
    document.getElementById(`${id}-tab-publications`)?.focus();
  };
  return <div className="marketing-sections">
    <div className="marketing-hub-heading"><div><span className="marketing-eyebrow">TU MARCA, EN MOVIMIENTO</span></div><span className="marketing-hub-badge">Contenido conectado a tu tienda</span></div>
    <nav className="marketing-section-navigation" aria-label="Apartados de Marketing">
      <Tabs tabs={sections} active={active} onChange={changeSection} idPrefix={id} label="Apartados de Marketing" numbered disabled={busy} />
    </nav>
    <AdminHelp>Cambia de apartado sin perder la publicación que estás editando. Las publicaciones se guardan en este navegador; las campañas, en tu tienda.</AdminHelp>
    {sections.map(section => <section key={section.id} role="tabpanel" id={`${id}-panel-${section.id}`} aria-labelledby={`${id}-tab-${section.id}`} hidden={active !== section.id} className="marketing-section-panel" tabIndex={0}>
      {section.id === 'publications' ? children : section.id === 'media' ? <MediaLibrary active={active === 'media'} isCurrent={isCurrent} onDirty={onMediaDirty} products={products} catalogStatus={catalogStatus} onOpenSharing={()=>changeSection('sharing')} onSelectProduct={selection=>{const prepared=onSelectProduct?.(selection)||false;if(prepared)openPublications();return prepared;}} onUseImage={async id=>{const prepared=await onUseImage?.(id)||false;if(prepared)openPublications();return prepared;}} /> : section.id === 'campaigns' ? campaignMounted&&<CampaignWorkspace home={home} onDirty={onCampaignDirty} /> : <Sharing active={active==='sharing'} home={home} isCurrent={isCurrent} onDirty={onSharingDirty} onOpenSocial={()=>navigate('/emprendedor/landing#contacto-horarios')} onPrepare={async(item,format)=>{if(!onPrepare)return false;const prepared=await onPrepare(item,format);if(prepared)openPublications();return prepared;}} />}
    </section>)}
  </div>;
}
