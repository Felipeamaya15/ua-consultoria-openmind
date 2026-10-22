import { useState } from 'react';
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
          placeholder="Mi Tienda · Productos de calidad"
          hint="Aparece en la pestaña del navegador y resultados de búsqueda"
          value={form.metaTitle}
          maxLength={150}
          onChange={(e) => update('metaTitle', e.target.value)}
        />
        <Textarea
          label="Descripción de la tienda en buscadores"
          rows={3}
          maxLength={160}
          placeholder="Descripción de tu tienda para motores de búsqueda..."
          hint={`${form.metaDescription.length}/160 caracteres (recomendado: 120-160 caracteres)`}
          value={form.metaDescription}
          onChange={(e) => update('metaDescription', e.target.value)}
        />
      </AdminCard>

      <AdminCard className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Medición y Analítica</h2>
          <div className="flex flex-wrap gap-2">
            {isAnalyticsActive && <Badge variant="success">Google Analytics activo</Badge>}
            {isPixelActive && <Badge variant="success">Meta Pixel activo</Badge>}
          </div>
        </div>

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
      {saved && <Alert variant="success">Datos para buscadores y medición guardados correctamente.</Alert>}

      <div>
        <Button type="submit">Guardar buscadores y medición</Button>
      </div>
    </form>
  );
}
