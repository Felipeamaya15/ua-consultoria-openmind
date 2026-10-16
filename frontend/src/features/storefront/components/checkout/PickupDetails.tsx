import { useId, useState } from 'react';
import { Icon } from '../ui/Icon';
import { groupPickupHours, type PickupConfiguration } from '../../../admin/services/pickupConfiguration';

/** Solo presentación: no cambia selección, precio, disponibilidad ni configuración. */
export default function PickupDetails({ pickup }: { pickup: PickupConfiguration }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const location = pickup.location;
  const summary = pickup.hours ? groupPickupHours(pickup.hours) : '';
  const groups = summary ? summary.split('; ').map(line => {
    const separator = line.indexOf(': ');
    return { days: line.slice(0, separator), time: line.slice(separator + 2) };
  }) : [];
  return <div className="text-[var(--visual-page-color)]">
    <button type="button" aria-expanded={expanded} aria-controls={`pickup-details-${id}`}
      className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold rounded-lg py-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      onClick={event => { event.preventDefault(); event.stopPropagation(); setExpanded(value => !value); }}>
      <span aria-hidden="true">ⓘ</span><span>{expanded ? 'Ocultar dirección y horarios' : 'Ver dirección y horarios'}</span>
      <Icon name="chevron" className={`block w-[18px] h-[18px] shrink-0 self-center transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
    {expanded && <div id={`pickup-details-${id}`} role="region" aria-label="Dirección y horarios de retiro"
      className="mt-2 border-t border-[var(--border)] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
      <section><h3 className="font-semibold mb-2">Dirección del establecimiento</h3>
        <address className="not-italic text-xs sm:text-sm leading-relaxed break-words">
          {location?.street ? <><p>{location.street} {location.number}</p>{location.reference && <p>{location.reference}</p>}<p className="mt-1">{[location.comuna, location.region].filter(Boolean).join(', ')}</p></>
            : <p>{pickup.address || 'Consulta la dirección con la tienda.'}</p>}
        </address>
      </section>
      <section><h3 className="font-semibold mb-2">Horarios disponibles</h3>
        {groups.length > 0 ? <ul className="space-y-3 text-xs sm:text-sm">{groups.map(group => <li key={group.days}><p className="font-medium">{group.days}</p><p className={group.time === 'cerrado' ? 'opacity-70' : ''}>{group.time === 'cerrado' ? 'Cerrado' : group.time}</p></li>)}</ul>
          : <p className="text-xs sm:text-sm whitespace-pre-line leading-relaxed">{pickup.schedule || 'Consulta los horarios con la tienda.'}</p>}
      </section>
    </div>}
  </div>;
}
