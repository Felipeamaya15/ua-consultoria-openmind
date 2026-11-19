import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchSelectedTemplate } from '../../shared/palettes';
import { templatePath } from '../../features/storefront/visual/templates';

/**
 * Lleva a quien entra a la raíz de la tienda a la plantilla que la dueña dejó activa en el servidor.
 * Si el servidor no responde o aún no hay plantilla guardada, usa la plantilla 1 (comportamiento anterior).
 */
export function SelectedTemplateRedirect() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchSelectedTemplate(controller.signal)
      .then(template => { if (!controller.signal.aborted) setTarget(templatePath(template)); })
      .catch(() => { if (!controller.signal.aborted) setTarget(templatePath('')); });
    return () => controller.abort();
  }, []);
  return target ? <Navigate to={target} replace /> : null;
}
