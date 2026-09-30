import { LandingContentEditor } from '../components/LandingContentEditor';
import { normalizeLandingContent } from '../../landing/types/landingContent';
import { fetchPublicProducts } from '../../storefront/services/catalogService';
import type { Product } from '../../storefront/data/mockData';
import { useEffect, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { templatePaths } from '../config/navigation';
import { AdminCard, Alert, Input, Button } from '../components/ui';
import { ImageUpload } from '../components/ui/ImageUpload';
import { fetchLandingConfig, saveLandingConfig } from '../../landing/services/landingService';
import type { LandingInput } from '../../landing/types/landing.types';

const emptyForm: LandingInput = {
  titulo: '', descripcion: '', texto_boton: '', imagen_principal: null, logo: null, contenido: normalizeLandingContent(),
  secciones: { 'Productos destacados': false, 'Categorías': false, 'Beneficios': false, 'Información de contacto': false, 'Mapa / ubicación': false },
};

export default function LandingPage() {
  const { config } = useAdmin();
  const [form, setForm] = useState<LandingInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const options = { retry: true, signal: controller.signal };
    fetchPublicProducts(options).then(data => { if (active) setProducts(data); })
      .catch(() => { if (active) setCatalogError('No se pudieron cargar los productos y categorías después de varios intentos. Recarga el panel cuando el catálogo esté disponible.'); })
      .finally(() => { if (active) setCatalogLoading(false); });
    fetchLandingConfig(options).then(config => {
      if (active && config) setForm({ ...config, contenido: normalizeLandingContent(config.contenido), secciones: { ...emptyForm.secciones, ...config.secciones } });
    }).catch(() => {
      if (active) {
        setError('No se pudo cargar la configuración después de varios intentos. Recarga el panel cuando el backend esté disponible.');
        setLoadFailed(true);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);
  function change(next: LandingInput) { setForm(next); setSaved(false); }
  async function save() {
    setSaving(true); setSaved(false); setError('');
    try { const savedConfig = await saveLandingConfig(form); setForm({ ...savedConfig, contenido: normalizeLandingContent(savedConfig.contenido), secciones: { ...emptyForm.secciones, ...savedConfig.secciones } }); setSaved(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la landing.'); }
    finally { setSaving(false); }
  }
  if (loading) return <p role="status">Cargando configuración...</p>;
  return <form className="flex flex-col gap-5 max-w-3xl" onSubmit={e => { e.preventDefault(); void save(); }}>
    <Alert variant="info">Configura la landing pública de tu tienda. Los cambios se guardan en el backend.</Alert>
    {error && <div role="alert"><Alert variant="error">{error}</Alert></div>}
    <fieldset disabled={saving || loadFailed} className="flex flex-col gap-5">
      {([{ key: 'titulo', label: 'Título principal', maxLength: 255 }, { key: 'descripcion', label: 'Descripción', maxLength: undefined }, { key: 'texto_boton', label: 'Texto del botón CTA', maxLength: 100 }] as const).map(field =>
        <AdminCard key={field.key}><Input label={field.label} value={form[field.key]} required={field.key !== 'descripcion'} maxLength={field.maxLength} onChange={e => change({ ...form, [field.key]: e.target.value })} /></AdminCard>)}
      <AdminCard><h2 className="text-sm font-semibold mb-3">Imagen principal (Hero)</h2><ImageUpload value={form.imagen_principal || ''} onChange={image => change({ ...form, imagen_principal: image || null })} maxMB={2} allowSVG={false} /></AdminCard>
      <AdminCard><h2 className="text-sm font-semibold mb-3">Logo</h2><ImageUpload value={form.logo || ''} onChange={logo => change({ ...form, logo: logo || null })} maxMB={1} allowSVG={false} /></AdminCard>
      {catalogLoading && <p role="status">Cargando productos y categorías...</p>}
      {catalogError && <div role="alert"><Alert variant="error">{catalogError}</Alert></div>}
      <LandingContentEditor catalogReady={!catalogLoading && !catalogError} value={normalizeLandingContent(form.contenido)} flags={form.secciones} products={products} onChange={contenido => change({ ...form, contenido })} onToggle={(name, enabled) => change({ ...form, secciones: { ...form.secciones, [name]: enabled } })} />
      <Button type="submit">{saving ? 'Guardando...' : 'Guardar Landing Page'}</Button>
    </fieldset>
    {saved && <Alert variant="success">Landing Page guardada en tu tienda.</Alert>}
    <a href={templatePaths[config.template]} target="_blank" rel="noreferrer">Ver landing pública</a>
  </form>;
}
