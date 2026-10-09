import { useLandingContent } from '../hooks/useLandingContent';
import { useLandingSectionVisibility } from '../hooks/useLandingSectionVisibility';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { weeklyHours } from '../types/weeklyHours';
import './LandingDetails.css';
import { Icon } from '../../storefront/components/ui';

const webLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;

export function LandingDetails({ includeBenefits = false }: { includeBenefits?: boolean }) {
  const { content } = useLandingContent();
  const visible = useLandingSectionVisibility();
  const { template = 'editorial', isCatalog } = useStorefrontTemplate();
  const tone = isCatalog ? 'border-white/15 text-white' : 'border-black/10 text-[#151515]';
  const c = content.contacto, u = content.ubicacion;
  const locality = [...new Set([u.comuna, u.ciudad].filter(Boolean))].join(' / ');
  const hasAddress = !!(u.direccion || locality || u.region);
  const hours = weeklyHours(c.horario);
  const contacts = [
    { label: 'Teléfono', icon: 'phone', text: c.telefono, href: c.telefono ? `tel:${c.telefono.replace(/[^+0-9]/g, '')}` : undefined },
    { label: 'WhatsApp', icon: 'chat', text: c.whatsapp, href: c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/\D/g, '')}` : undefined },
    { label: 'Correo', icon: 'mail', text: c.correo, href: c.correo ? `mailto:${c.correo}` : undefined },
    { label: 'Instagram', icon: 'instagram', text: c.instagram, href: webLink(c.instagram) },
    { label: 'Facebook', icon: 'facebook', text: c.facebook, href: webLink(c.facebook) },
    { label: 'Sitio web', icon: 'globe', text: c.sitio_web, href: webLink(c.sitio_web) },
  ].filter(item => item.text);
  return <>
    {includeBenefits && visible('Beneficios') && content.beneficios.length > 0 && <section className={`max-w-6xl mx-auto px-5 py-12 border-t ${tone}`} aria-label="Beneficios">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">{content.beneficios.map((b, i) => <div key={i}><Icon name={b.icono} className="w-6 h-6" /><h2 className="font-semibold mt-4">{b.titulo}</h2>{b.descripcion && <p className="text-sm opacity-70 mt-2">{b.descripcion}</p>}</div>)}</div>
    </section>}
    {visible('Información de contacto') && (contacts.length > 0 || c.horario) && <section data-landing-content data-template={template} className="landing-details" aria-label="Información de contacto">
      <div className="landing-details__inner">
        <header className="landing-details__heading"><span className="landing-details__eyebrow">Contacto</span><h2>Información de contacto</h2></header>
        <div className={`landing-details__contact-layout ${c.horario && contacts.length ? 'landing-details__contact-layout--with-hours' : ''}`}>
          {contacts.length > 0 && <div className="landing-details__contacts">{contacts.map(item => {
            const card = <><span className="landing-details__icon"><Icon name={item.icon} className="w-5 h-5" /></span><span className="landing-details__contact-copy"><span className="landing-details__label">{item.label}</span><span className="landing-details__value">{item.text}</span></span>{item.href && <Icon name="arrowUpRight" className="landing-details__link-arrow" />}</>;
            return item.href ? <a key={item.label} href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="landing-details__contact-card">{card}</a> : <div key={item.label} className="landing-details__contact-card">{card}</div>;
          })}</div>}
          {c.horario && <div className="landing-details__hours">
            <h3><span className="landing-details__icon"><Icon name="clock" className="w-5 h-5" /></span>Horario de atención</h3>
            {hours ? <ul className="landing-details__hours-list">{hours.map(row => <li key={row.day}><span>{row.day}</span><span className={row.hours === 'Cerrado' ? 'landing-details__closed' : ''}>{row.hours}{row.overnight && <small>Cierra al día siguiente</small>}</span></li>)}</ul> : <p className="landing-details__legacy-hours">{c.horario}</p>}
          </div>}
        </div>
      </div>
    </section>}
    {visible('Mapa / ubicación') && (hasAddress || webLink(u.enlace_maps)) && <section data-landing-content data-template={template} className="landing-details landing-details--location" aria-label="Ubicación">
      <div className="landing-details__inner">
        <header className="landing-details__heading"><span className="landing-details__eyebrow">Ubicación</span><h2>Dónde encontrarnos</h2></header>
        <div className="landing-details__location-card">
          <span className="landing-details__location-icon"><Icon name="pin" className="w-8 h-8" /></span>
          {hasAddress && <address className="landing-details__address">{u.direccion && <p className="landing-details__street">{u.direccion}</p>}{locality && <p>{locality}</p>}{u.region && <p className="landing-details__region">{u.region}</p>}</address>}
          {webLink(u.enlace_maps) && <a href={u.enlace_maps} target="_blank" rel="noopener noreferrer" className="landing-details__maps-button">Ver en Google Maps<Icon name="arrowUpRight" className="w-4 h-4" /></a>}
        </div>
      </div>
    </section>}
  </>;
}
