import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AdminCard, Button, Tabs } from '../../admin/components/ui';
import { AdminHelp } from '../../admin/components/AdminPageHeader';

const sections = [
  { id: 'publications', label: 'Publicaciones' },
  { id: 'social', label: 'Redes sociales' },
  { id: 'media', label: 'Biblioteca multimedia' },
  { id: 'sharing', label: 'Difusión' },
];

/** Keep the workspace mounted: changing sections never discards its draft/history. */
export function MarketingSections({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  const [active, setActive] = useState('publications');
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
      {section.id === 'publications' ? children : <AdminCard className="marketing-section-information">
        <h3>{section.label}</h3>
        {section.id === 'social' && <>
          <p>La gestión de perfiles desde Marketing estará disponible próximamente.</p>
          <p>Actualmente puedes editar los enlaces de contacto de tu tienda desde Página principal. Registrar un enlace no autoriza una cuenta para publicar.</p>
          <Link to="/emprendedor/landing#contacto-horarios" className="marketing-text-link">Editar enlaces de contacto →</Link>
        </>}
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
