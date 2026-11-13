import { useEffect, useState } from 'react';
import { fetchStoreInformation, type StoreInformation } from '../../storefront/services/storeInformationService';
import { useAdmin } from '../context/AdminContext';
import { AdminCard, Alert, Input, Textarea, Button, Badge } from '../components/ui';
import { GoogleAnalyticsField } from '../components/GoogleAnalyticsField';
import { MetaPixelField } from '../components/MetaPixelField';
import { validatePixelId } from '../../storefront/services/metaPixelService';
import { validateGoogleAnalyticsId } from '../../storefront/services/googleAnalyticsService';

export default function SeoAnalytics() {
  const { config, setConfig } = useAdmin();
  const [form, setForm] = useState({
    metaTitle: config.metaTitle ?? '',
    metaDescription: config.metaDescription ?? '',
    gaId: config.gaId ?? '',
    pixelId: config.pixelId ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [business, setBusiness] = useState<StoreInformation | null>(null);
  const [suggestionError, setSuggestionError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetchStoreInformation(controller.signal, true).then(value => {
      if (!controller.signal.aborted) setBusiness(value);
    }).catch(() => {
      if (!controller.signal.aborted) setSuggestionError('No se pudieron cargar las sugerencias del negocio. Puedes escribir el SEO manualmente.');
    });
    return () => controller.abort();
  }, []);

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const analyticsValidation = validateGoogleAnalyticsId(form.gaId);
    if (!analyticsValidation.valid) {
      setError(analyticsValidation.error || 'Identificador de Google Analytics inválido.');
      setSaved(false);
      return;
    }

    // Validación del identificador de Meta/Facebook Pixel
    const pixelValidation = validatePixelId(form.pixelId);
    if (!pixelValidation.valid) {
      setError(pixelValidation.error || 'Identificador de Meta/Facebook Pixel inválido.');
      setSaved(false);
      return;
    }

    const cleanPixelId = pixelValidation.pixelId;
    const cleanGaId = analyticsValidation.measurementId;
    const cleanMetaTitle = form.metaTitle.trim();
    const cleanMetaDescription = form.metaDescription.trim();

    const success = setConfig({
      ...config,
      ...form,
      pixelId: cleanPixelId,
      gaId: cleanGaId,
      metaTitle: cleanMetaTitle,
      metaDescription: cleanMetaDescription,
    });

    if (success) {
      setSaved(true);
      setError('');
    } else {
      setError('No se pudo guardar la configuración. Intenta nuevamente.');
      setSaved(false);
    }
  };

  const isPixelActive = Boolean(form.pixelId && /^\d{9,16}$/.test(form.pixelId.trim()));
  const analyticsValidation = validateGoogleAnalyticsId(form.gaId);
  const isAnalyticsActive = Boolean(analyticsValidation.valid && analyticsValidation.measurementId);

  return (
    <form className="w-full flex flex-col gap-5" onSubmit={handleSubmit}>
      <Alert variant="info">
        Configura cómo se presenta tu tienda en buscadores y el identificador de Meta/Facebook Pixel para seguimiento y campañas de anuncios.
      </Alert>

      <AdminCard className="grid gap-4">
        <h2 className="font-semibold text-sm">Información para buscadores (SEO de la tienda)</h2>
        <Input
          label="Título de la tienda en buscadores"
          placeholder={business?.nombre.slice(0, 150) || "Título para buscadores"}
          hint="Aparece en la pestaña del navegador y resultados de búsqueda"
          value={form.metaTitle}
          maxLength={150}
          onChange={(e) => update('metaTitle', e.target.value)}
        />
        <Textarea
          label="Descripción de la tienda en buscadores"
          rows={3}
          maxLength={160}
          placeholder={business?.descripcion?.slice(0, 160) || "Descripción de tu tienda para motores de búsqueda..."}
          hint={`${form.metaDescription.length}/160 caracteres (recomendado: 120-160 caracteres)`}
          value={form.metaDescription}
          onChange={(e) => update('metaDescription', e.target.value)}
        />
        {suggestionError && <p role="status" className="text-sm">{suggestionError}</p>}
        {business && ((!form.metaTitle.trim() && business.nombre) || (!form.metaDescription.trim() && business.descripcion)) && (
          <div className="rounded-lg bg-[var(--muted)] p-3 text-sm space-y-2">
            <p>Sugerencias del negocio, todavía sin guardar. Puedes copiarlas a los campos vacíos y revisarlas antes de guardar.</p>
            {!form.metaTitle.trim() && business.nombre && <p><strong>Título sugerido:</strong> {business.nombre.slice(0, 150)}</p>}
            {!form.metaDescription.trim() && business.descripcion && <p><strong>Descripción sugerida:</strong> {business.descripcion.slice(0, 160)}</p>}
            <Button type="button" variant="outline" onClick={() => { setForm(current => ({ ...current, metaTitle: current.metaTitle.trim() ? current.metaTitle : business.nombre.slice(0, 150), metaDescription: current.metaDescription.trim() ? current.metaDescription : (business.descripcion || '').slice(0, 160) })); setSaved(false) }}>Usar sugerencias en campos vacíos</Button>
          </div>
        )}
      </AdminCard>

      <AdminCard className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Medición y Analítica</h2>
          <div className="flex flex-wrap gap-2">
            {isAnalyticsActive && <Badge variant="success">Google Analytics configurado</Badge>}
            {isPixelActive && <Badge variant="success">Meta Pixel configurado</Badge>}
          </div>
        </div>

        <p className="text-sm text-[var(--muted-foreground)]">Guardar un identificador no sustituye el consentimiento: la medición respeta las preferencias de cookies de la tienda.</p>
        <MetaPixelField
          value={form.pixelId}
          onChange={(value) => update('pixelId', value)}
        />

        <GoogleAnalyticsField
          value={form.gaId}
          onChange={(value) => update('gaId', value)}
        />
      </AdminCard>

      {error && <Alert variant="error">{error}</Alert>}
      {saved && <Alert variant="success">Datos para buscadores y medición guardados correctamente en este navegador.</Alert>}

      <div>
        <Button type="submit">Guardar buscadores y medición</Button>
      </div>
    </form>
  );
}
