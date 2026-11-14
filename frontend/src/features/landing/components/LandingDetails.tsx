import { LocationPreview } from './LocationPreview';
import { mapLocation } from '../types/mapLocation';
import { benefitIcon } from '../types/benefitIcons';
import { VISUAL_SECTION } from '../../storefront/visual/sectionIds';
import { useLandingContent } from '../hooks/useLandingContent';
import { useLandingSectionVisibility } from '../hooks/useLandingSectionVisibility';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { weeklyHours } from '../types/weeklyHours';
import { contactChannels } from '../types/landingContent';
import './LandingDetails.css';
import { Icon } from '../../storefront/components/ui';


export function LandingDetails({includeBenefits = false,onlyBenefits = false,}: {includeBenefits?: boolean;onlyBenefits?: boolean;}) {
  const { content } = useLandingContent();
  const visible = useLandingSectionVisibility();
  const { template = 'editorial', isCatalog } = useStorefrontTemplate();
  const tone = isCatalog ? 'border-[var(--visual-border)] text-[var(--visual-text)]' : 'border-black/10 text-[#151515]';
  const c = content.contacto, u = content.ubicacion;
  const location = mapLocation(u);
  const hours = weeklyHours(c.horario);
  const showHours=visible('Horarios de atención')&&!!c.horario;
  const showContact=visible('Información de contacto');
  const contacts = contactChannels(c);
  return <>
    {includeBenefits && visible('Beneficios') && content.beneficios.length > 0 && <section data-visual-section={VISUAL_SECTION.sections} data-visual-kind="benefits" className={`max-w-6xl mx-auto px-5 py-12 border-t ${tone}`} aria-label="Beneficios">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">{content.beneficios.map((b, i) => <div key={i}><Icon name={benefitIcon(b.icono)} className="w-6 h-6" /><h2 className="font-semibold mt-4">{b.titulo}</h2>{b.descripcion && <p className="text-sm opacity-70 mt-2">{b.descripcion}</p>}</div>)}</div>
    </section>}
    {!onlyBenefits && ((showContact && contacts.length > 0) || showHours) && <section data-visual-section={VISUAL_SECTION.contact} data-landing-content data-template={template} className="landing-details" aria-label="Información de contacto">
      <div className="landing-details__inner">
        <header className="landing-details__heading"><span className="landing-details__eyebrow">Contacto</span><h2>{showContact&&contacts.length?'Información de contacto':'Horario de atención'}</h2></header>
        <div className={`landing-details__contact-layout ${showHours && showContact && contacts.length ? 'landing-details__contact-layout--with-hours' : ''}`}>
          {showContact && contacts.length > 0 && <div className="landing-details__contacts" data-count={contacts.length}>{contacts.map(item => {
            const card = <><span className="landing-details__icon"><Icon name={item.icon} className="w-5 h-5" /></span><span className="landing-details__contact-copy"><span className="landing-details__label">{item.label}</span><span className="landing-details__value">{item.text}</span></span>{item.href && <Icon name="arrowUpRight" className="landing-details__link-arrow" />}</>;
            return item.href ? <a key={item.label} href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="landing-details__contact-card">{card}</a> : <div key={item.label} className="landing-details__contact-card">{card}</div>;
          })}</div>}
          {showHours && <div className="landing-details__hours">
            <h3><span className="landing-details__icon"><Icon name="clock" className="w-5 h-5" /></span>Horario de atención</h3>
            {hours ? <ul className="landing-details__hours-list">{hours.map(row => <li key={row.day}><span>{row.day}</span><span className={row.hours === 'Cerrado' ? 'landing-details__closed' : ''}>{row.hours}{row.overnight && <small>Cierra al día siguiente</small>}</span></li>)}</ul> : <p className="landing-details__legacy-hours">{c.horario}</p>}
          </div>}
        </div>
      </div>
    </section>}
    {!onlyBenefits && visible('Mapa / ubicación') && (location.address || location.href) && <section data-visual-section={VISUAL_SECTION.location} data-landing-content data-template={template} className="landing-details landing-details--location" aria-label="Ubicación">
      <div className="landing-details__inner">
        <header className="landing-details__heading"><span className="landing-details__eyebrow">Ubicación</span><h2>Dónde encontrarnos</h2></header>
        <LocationPreview value={u} />
      </div>
    </section>}
  </>;
}
