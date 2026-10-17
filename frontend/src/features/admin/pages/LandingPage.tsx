import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BusinessInformation } from '../components/BusinessInformation';
import LandingPageContent from '../components/LandingPageContent';

export default function LandingPage() {
  const { hash } = useLocation();
  useEffect(() => {
    const target = hash === '#pagina-principal' ? 'pagina-principal' : hash === '#informacion-negocio' ? 'informacion-negocio' : null;
    if (target) document.getElementById(target)?.scrollIntoView();
  }, [hash]);
  return <div className="max-w-3xl space-y-5">
    <BusinessInformation />
    <section id="pagina-principal" aria-label="Contenido de la página principal" className="scroll-mt-24">
      <LandingPageContent />
    </section>
  </div>;
}
