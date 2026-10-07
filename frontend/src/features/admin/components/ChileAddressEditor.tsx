import { useState } from 'react';
import type { UbicacionLanding } from '../../landing/types/landing.types';
import territory from '../data/chileTerritory.json';
import localities from '../data/chileLocalities.json';
import { Input, Select } from './ui';

// Fuente: SUBDERE, CUT_2018_v04.xls (incluye Ñuble). La provincia filtra
// comunas; se puede reconstruir desde la comuna sin añadir campos al backend.
export function ChileAddressEditor({ value, onChange }: { value: UbicacionLanding; onChange: (value: UbicacionLanding) => void }) {
  const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^region\s+(de\s+|del\s+)?/, '').trim();
  const previousName = normalize(value.region);
  const region = territory.find(item => item.nombre === value.region)
    || (previousName ? territory.find(item => normalize(item.nombre).includes(previousName === 'rm' ? 'metropolitana' : previousName)) : undefined);
  const inferred = region?.provincias.find(item => item.comunas.includes(value.comuna))?.codigo || '';
  const [filter, setFilter] = useState({ region: value.region, province: inferred });
  const [customLocality, setCustomLocality] = useState(false);
  const cities = (localities as Record<string, Record<string, string[]>>)[region?.nombre || value.region]?.[value.comuna] || [];
  const province = filter.region === value.region ? filter.province : inferred;
  const communes = region?.provincias.filter(item => !province || item.codigo === province).flatMap(item => item.comunas).sort((a, b) => a.localeCompare(b, 'es')) || [];
  const options = (names: string[], current: string, placeholder: string) => [{ value: '', label: placeholder }, ...[...new Set(current ? [current, ...names] : names)].map(name => ({ value: name, label: name }))];
  return <div className="space-y-3">
    <Select label="Región" value={value.region} options={options(territory.map(item => item.nombre), value.region, 'Selecciona una región')} onChange={e => {
      setFilter({ region: e.target.value, province: '' });
      setCustomLocality(false);
      onChange({ ...value, region: e.target.value, comuna: '', ciudad: '' });
    }} />
    <Select label="Provincia (filtro de comunas)" disabled={!region} value={province} options={[{ value: '', label: 'Todas las provincias de la región' }, ...(region?.provincias.map(item => ({ value: item.codigo, label: item.nombre })) || [])]} onChange={e => {
      setFilter({ region: value.region, province: e.target.value });
      setCustomLocality(false);
      onChange({ ...value, comuna: '', ciudad: '' });
    }} />
    <Select label="Comuna" disabled={!value.region} value={value.comuna} options={options(communes, value.comuna, 'Selecciona una comuna')} onChange={e => { setCustomLocality(false); onChange({ ...value, comuna: e.target.value, ciudad: '' }); }} />
    <Select label="Ciudad / localidad" disabled={!value.comuna} value={customLocality ? '__other__' : value.ciudad} options={[...options(cities, customLocality ? '' : value.ciudad, 'Selecciona una ciudad o localidad'), { value: '__other__', label: 'Otra localidad (escribir)' }]} onChange={e => {
      setCustomLocality(e.target.value === '__other__');
      onChange({ ...value, ciudad: e.target.value === '__other__' ? '' : e.target.value });
    }} hint="Ciudades y pueblos del INE (Censo 2017). Usa Otra localidad si no está en la lista." />
    {customLocality && <Input label="Nombre de la localidad" required value={value.ciudad} maxLength={100} onChange={e => onChange({ ...value, ciudad: e.target.value })} />}
    <Input label="Dirección (calle, número y complemento)" value={value.direccion} maxLength={250} autoComplete="street-address" onChange={e => onChange({ ...value, direccion: e.target.value })} />
    <Input label="Enlace de Google Maps (URL completa)" type="url" value={value.enlace_maps} onChange={e => onChange({ ...value, enlace_maps: e.target.value })} />
  </div>;
}
