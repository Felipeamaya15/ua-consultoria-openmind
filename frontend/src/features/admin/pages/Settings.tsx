import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminCard, Alert, Input, Textarea, Button } from '../components/ui';
import LandingPage from './LandingPage';
import { fetchStoreInformation, saveStoreInformation } from '../../storefront/services/storeInformationService';
import { useStoreIdentity } from '../../storefront/context/StoreIdentityContext';
import { readStoredStoreConfig } from '../../storefront/visual/storage';

export function BusinessInformation() {
  const { identity } = useStoreIdentity();
  const [form, setForm] = useState({ nombre: '', descripcion: '' });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const legacy = readStoredStoreConfig(identity);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadFailed(false); setError('');
    fetchStoreInformation(controller.signal).then(data => { if (!controller.signal.aborted) setForm({ nombre: data.nombre, descripcion: data.descripcion || '' }); })
      .catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); setError('No se pudo cargar la información del negocio. Reintenta antes de editar.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  async function save() {
    if (!form.nombre.trim()) { setSaved(false); setError('Escribe un nombre para tu tienda.'); return; }
    setSaving(true); setSaved(false); setError('');
    try { const result = await saveStoreInformation(form); setForm({ nombre: result.nombre, descripcion: result.descripcion || '' }); setSaved(true); }
    catch { setError('No se pudo guardar la información del negocio. Revisa los campos y tu sesión e intenta nuevamente.'); }
    finally { setSaving(false); }
  }
  return <section id="informacion-negocio" aria-labelledby="business-title" className="scroll-mt-24">
    <h2 id="business-title" className="font-bold text-lg mb-4">Información del negocio</h2>
    {loading ? <p role="status">Cargando información del negocio...</p> : <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4">
      {error && <div role="alert"><Alert variant="error">{error}</Alert></div>}
      {loadFailed && <Button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</Button>}
      <fieldset disabled={saving || loadFailed} className="space-y-4"><AdminCard className="space-y-4">
        <Input label="Nombre de la tienda (obligatorio)" required maxLength={150} value={form.nombre} onChange={e => { setSaved(false); setForm({ ...form, nombre: e.target.value }); }} />
        <Textarea label="Descripción del negocio" value={form.descripcion} rows={3} onChange={e => { setSaved(false); setForm({ ...form, descripcion: e.target.value }); }} />
        <p className="text-xs text-[var(--muted-foreground)]">Identifica tu negocio en la tienda y en los informes. La descripción de portada se edita en el apartado siguiente.</p>
        {(typeof legacy.name === 'string' || typeof legacy.description === 'string') && <Button type="button" variant="outline" onClick={() => { setSaved(false); setForm({ nombre: typeof legacy.name === 'string' ? legacy.name : form.nombre, descripcion: typeof legacy.description === 'string' ? legacy.description : form.descripcion }); }}>Recuperar nombre y descripción de este navegador</Button>}
      </AdminCard><Button type="submit">{saving ? 'Guardando...' : 'Guardar información del negocio'}</Button></fieldset>
      {saved && <div role="status"><Alert variant="success">Información del negocio guardada en tu tienda.</Alert></div>}
    </form>}
  </section>;
}

export default function Settings() {
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
      <LandingPage />
    </section>
  </div>;
}
