import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AdminCard, Button, Tabs } from '../../admin/components/ui';
import { AdminHelp } from '../../admin/components/AdminPageHeader';
import { SocialProfiles } from './SocialProfiles';

const sections = [
  { id: 'publications', label: 'Publicaciones' },
  { id: 'social', label: 'Redes sociales' },
  { id: 'media', label: 'Biblioteca multimedia' },
  { id: 'sharing', label: 'Difusión' },
];

/** Keep the workspace mounted: changing sections never discards its draft/history. */
export function MarketingSections({ children, busy = false, isCurrent, onSocialDirty }: { children: ReactNode; busy?: boolean; isCurrent: () => boolean; onSocialDirty: (dirty: boolean) => void }) {
  const [active, setActive] = useState(() => window.location.hash === '#redes-sociales' ? 'social' : 'publications');
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
      {section.id === 'publications' ? children : section.id === 'social' ? <SocialProfiles active={active === 'social'} isCurrent={isCurrent} onDirty={onSocialDirty} /> : <AdminCard className="marketing-section-information">
        <h3>{section.label}</h3>
        {section.id === 'media' && <>
          <p>La biblioteca de contenido reutilizable estará disponible próximamente.</p>
          <p>Puedes seguir utilizando las imágenes de tus productos en Publicaciones y administrar las imágenes de tu tienda desde Secciones.</p>
          <Link to="/emprendedor/landing#secciones-tienda" className="marketing-text-link">Administrar secciones e imágenes →</Link>
        </>}
        {section.id === 'sharing' && <>
          <p>Descarga tu publicación en PNG o JPG desde Publicaciones y compártela manualmente en tus canales.</p>
          <p>Los enlaces para compartir y la publicación automática todavía no están disponibles desde este apartado.</p>
          <Button type="button" variant="outline" onClick={openPublications}>Ir a publicaciones</Button>
        </>}
      </AdminCard>}
    </section>)}
  </div>;
}
