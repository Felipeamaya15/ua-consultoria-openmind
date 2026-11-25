import { Link } from 'react-router-dom';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
export function CommercialPreferencesLink() {
  const {route} = useStorefrontTemplate();
  return <div className="px-4 py-4 text-center text-sm"><Link className="inline-block underline py-2" to={route('preferencias-comerciales')}>Preferencias de publicidad</Link></div>;
}
