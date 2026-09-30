import type { ReactNode } from 'react';
import type { Product } from '../../storefront/data/mockData';
import type { ContenidoLanding, ContactoLanding } from '../../landing/types/landing.types';
import { ChileAddressEditor } from './ChileAddressEditor';
import { WeeklyHoursEditor } from './WeeklyHoursEditor';
import { AdminCard, Input, Toggle, Button } from './ui';

type Props = {
  catalogReady?: boolean;
  value: ContenidoLanding; flags: Record<string, boolean>; products: Product[];
  onChange: (value: ContenidoLanding) => void;
  onToggle: (name: string, enabled: boolean) => void;
};
const icons = { truck: 'Envío', lock: 'Seguridad', return: 'Devolución', chat: 'Soporte' };

export function LandingContentEditor({ value, flags, products, onChange, onToggle, catalogReady = true }: Props) {
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const ids = new Set(products.map(p => p.catalogId));
  function select(key: 'productos_destacados' | 'categorias', id: string, checked: boolean) {
    onChange({ ...value, [key]: checked ? [...value[key], id] : value[key].filter(v => v !== id) });
  }
  function card(name: string, controls: ReactNode) {
    const needsCatalog = name === 'Productos destacados' || name === 'Categorías';
    return <AdminCard><div className="flex items-center justify-between gap-4 mb-4"><h2 className="font-semibold">{name}</h2><Toggle ariaLabel={name} checked={flags[name] === true} onChange={enabled => onToggle(name, enabled)} /></div>
      <fieldset disabled={flags[name] !== true || (needsCatalog && !catalogReady)} className={flags[name] === true ? 'space-y-3' : 'space-y-3 opacity-50'}>{needsCatalog && !catalogReady ? <p className="text-sm">Esperando la carga del catálogo. Tu selección se conserva.</p> : controls}</fieldset></AdminCard>;
  }
  return <>
    {card('Productos destacados', <>
      <p className="text-sm">Selecciona hasta 6 productos activos. Se conserva el orden de selección.</p>
      {!products.length && <p className="text-sm">No hay productos activos disponibles.</p>}
      {products.map(p => <label key={p.catalogId} className="flex gap-3 items-center text-sm"><input type="checkbox" checked={value.productos_destacados.includes(p.catalogId!)} disabled={!value.productos_destacados.includes(p.catalogId!) && value.productos_destacados.length >= 6} onChange={e => select('productos_destacados', p.catalogId!, e.target.checked)} />{p.name} · {p.category}</label>)}
      {value.productos_destacados.filter(id => !ids.has(id)).map(id => <div key={id} className="text-sm">Producto no disponible: {id} <Button type="button" variant="ghost" onClick={() => select('productos_destacados', id, false)}>Quitar selección</Button></div>)}
    </>)}
    {card('Categorías', <>
      <p className="text-sm">Hasta 6 categorías reales del catálogo. Editorial y Minimal tienen bloques de categorías.</p>
      {!categories.length && <p className="text-sm">No hay categorías disponibles en el catálogo activo.</p>}
      {categories.map(c => <label key={c} className="flex gap-3 items-center text-sm"><input type="checkbox" checked={value.categorias.includes(c)} disabled={!value.categorias.includes(c) && value.categorias.length >= 6} onChange={e => select('categorias', c, e.target.checked)} />{c}</label>)}
      {value.categorias.filter(c => !categories.includes(c)).map(c => <div key={c}>Categoría no disponible: {c} <Button type="button" variant="ghost" onClick={() => select('categorias', c, false)}>Quitar selección</Button></div>)}
    </>)}
    {card('Beneficios', <>
      <p className="text-sm">Hasta 4 beneficios personalizados.</p>
      {value.beneficios.map((b, index) => <div key={index} className="border border-[var(--border)] rounded-lg p-3 space-y-3">
        <Input label="Título del beneficio" value={b.titulo} required maxLength={100} onChange={e => onChange({ ...value, beneficios: value.beneficios.map((old, i) => i === index ? { ...old, titulo: e.target.value } : old) })} />
        <Input label="Descripción del beneficio" value={b.descripcion} maxLength={250} onChange={e => onChange({ ...value, beneficios: value.beneficios.map((old, i) => i === index ? { ...old, descripcion: e.target.value } : old) })} />
        <label className="block text-sm">Icono<select className="block border rounded p-2 mt-1" value={b.icono} onChange={e => onChange({ ...value, beneficios: value.beneficios.map((old, i) => i === index ? { ...old, icono: e.target.value as typeof b.icono } : old) })}>{Object.entries(icons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <Button type="button" variant="ghost" onClick={() => onChange({ ...value, beneficios: value.beneficios.filter((_, i) => i !== index) })}>Quitar beneficio</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={value.beneficios.length >= 4} onClick={() => onChange({ ...value, beneficios: [...value.beneficios, { titulo: '', descripcion: '', icono: 'truck' }] })}>Agregar beneficio</Button>
    </>)}
    {card('Información de contacto', <>
      {([['telefono', 'Teléfono (con código de país)', 'tel'], ['whatsapp', 'WhatsApp (número con código de país)', 'tel'], ['correo', 'Correo electrónico', 'email'], ['instagram', 'Instagram (URL completa)', 'url'], ['facebook', 'Facebook (URL completa)', 'url'], ['sitio_web', 'Sitio web', 'url']] as const).map(([key, label, type]) => <Input key={key} label={label} type={type} maxLength={type === 'tel' ? 40 : undefined} pattern={type === 'tel' ? '\+?[0-9 ()-]{5,40}' : undefined} hint={type === 'tel' ? 'Ejemplo: +56 9 1234 5678' : undefined} value={value.contacto[key]} onChange={e => onChange({ ...value, contacto: { ...value.contacto, [key as keyof ContactoLanding]: e.target.value } })} />)}
      <WeeklyHoursEditor value={value.contacto.horario} onChange={horario => onChange({ ...value, contacto: { ...value.contacto, horario } })} />
    </>)}
    {card('Mapa / ubicación', <>
      <ChileAddressEditor value={value.ubicacion} onChange={ubicacion => onChange({ ...value, ubicacion })} />
    </>)}
  </>;
}
