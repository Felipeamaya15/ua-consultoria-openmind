import { NavLink } from 'react-router-dom';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';

export function CustomerAccountNavigation() {
  const { route } = useStorefrontTemplate();
  return <nav aria-label="Mi cuenta" className="flex gap-5 border-b pb-3 mb-5">
    <NavLink to={route('perfil')} className={({isActive}) => isActive ? 'font-semibold underline' : 'hover:underline'}>Perfil</NavLink>
    <NavLink to={route('mis-pedidos')} className={({isActive}) => isActive ? 'font-semibold underline' : 'hover:underline'}>Mis pedidos</NavLink>
  </nav>;
}
