import { useId, useState, type ReactNode } from 'react';
import { Tabs } from '../../admin/components/ui';
import { AdminHelp } from '../../admin/components/AdminPageHeader';
import { Link } from 'react-router-dom';
import { MediaLibrary } from './MediaLibrary';
import { Sharing } from './Sharing';
import type { SharingItem } from '../domain/sharing';
import type { PublicationFormat } from '../domain/types';

const sections = [
  { id: 'publications', label: 'Publicaciones' },
  { id: 'social', label: 'Redes sociales' },
  { id: 'media', label: 'Biblioteca multimedia' },
  { id: 'sharing', label: 'Difusión' },
];

/** Keep the workspace mounted: changing sections never discards its draft/history. */
export function MarketingSections({ children, busy = false, isCurrent, onMediaDirty, home='', onSharingDirty=()=>{}, onPrepare }: { children: ReactNode; busy?: boolean; isCurrent: () => boolean; onSocialDirty: (dirty: boolean) => void; onMediaDirty: (dirty: boolean) => void; home?:string; onSharingDirty?:(dirty:boolean)=>void; onPrepare?:(item:SharingItem,format:PublicationFormat)=>Promise<boolean> }) {
  const [active, setActive] = useState(() => window.location.hash === '#difusion' ? 'sharing' : window.location.hash === '#biblioteca' ? 'media' : window.location.hash === '#redes-sociales' ? 'social' : 'publications');
  const id = useId();
  const openPublications = () => {
    setActive('publications');
    document.getElementById(`${id}-tab-publications`)?.focus();
  };
  return <div className="marketing-sections">
    <nav className="marketing-section-navigation" aria-label="Apartados de Marketing">
      <Tabs tabs={sections} active={active} onChange={setActive} idPrefix={id} label="Apartados de Marketing" numbered disabled={busy} />
    </nav>
    <AdminHelp>Cambia de apartado sin perder la publicación que estás editando. Los borradores siguen guardándose en este navegador.</AdminHelp>
    {sections.map(section => <section key={section.id} role="tabpanel" id={`${id}-panel-${section.id}`} aria-labelledby={`${id}-tab-${section.id}`} hidden={active !== section.id} className="marketing-section-panel" tabIndex={0}>
      {section.id === 'publications' ? children : section.id === 'social' ? <div className="space-y-3"><h2 className="font-semibold">Redes sociales de tu tienda</h2><p>El teléfono, correo público y perfiles sociales se editan juntos en Página principal → Contacto y horarios. Tus perfiles y las herramientas de difusión se conservan.</p><Link className="lp-button" to="/emprendedor/landing#contacto-horarios">Editar contacto y redes sociales ↗</Link></div> : section.id === 'media' ? <MediaLibrary active={active === 'media'} isCurrent={isCurrent} onDirty={onMediaDirty} /> : <Sharing active={active==='sharing'} home={home} isCurrent={isCurrent} onDirty={onSharingDirty} onOpenSocial={()=>setActive('social')} onPrepare={async(item,format)=>{if(!onPrepare)return false;const prepared=await onPrepare(item,format);if(prepared)openPublications();return prepared;}} />}
    </section>)}
  </div>;
}
