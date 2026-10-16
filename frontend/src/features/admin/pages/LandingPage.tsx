import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BusinessInformation } from '../components/BusinessInformation';
import LandingPageContent from '../components/LandingPageContent';

export default function LandingPage() {
  const { hash } = useLocation();
  useEffect(() => {
    const target = hash === '#pagina-principal' ? 'pagina-principal' : hash === '#informacion-negocio' ? 'informacion-negocio' : null;
    if (target) document.getElementById(target)?.scrollIntoView();
  }, [hash]);
  return <div className="max-w-3xl space-y-8">
    <nav aria-label="Apartados de configuración" className="flex flex-wrap gap-3 text-sm font-semibold text-[var(--primary)]">
      <a href="#informacion-negocio" className="underline">Información del negocio</a>
      <a href="#pagina-principal" className="underline">Página principal y contacto</a>
      <Link to="/emprendedor/diseno" className="underline">Apariencia y editor visual →</Link>
    </nav>
    <BusinessInformation />
    <section id="pagina-principal" aria-labelledby="landing-title" className="scroll-mt-24 border-t border-[var(--border)] pt-6">
      <h2 id="landing-title" className="font-bold text-lg mb-2">Página principal y contacto</h2>
      <p className="text-sm text-[var(--muted-foreground)] mb-5">Administra la portada, el logo, el contenido, los datos de contacto y la ubicación de tu tienda.</p>
      <LandingPageContent />
    </section>
  </div>;
}
