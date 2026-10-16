import { useEffect, useState } from 'react';

import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import {
  fetchProductoAtributos,
  type AtributoGeneral,
} from '../../services/productAttributesService';

interface ProductAttributesProps {
  slug: string;
  previewAttributes?: AtributoGeneral[];
}

interface Styles {
  wrapper: string;
  title: string;
  list: string;
  label: string;
  value: string;
}

const STYLES: Record<'editorial' | 'minimal' | 'visual' | 'catalog', Styles> = {
  editorial: {
    wrapper: 'border-t border-[var(--border)] pt-5',
    title: 'text-sm font-semibold mb-3',
    list: 'grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm',
    label: 'text-[var(--muted-foreground)]',
    value: 'font-medium text-[var(--foreground)]',
  },
  minimal: {
    wrapper: 'border-t border-[var(--visual-global-border)]/5 pt-5',
    title: 'text-base font-semibold mb-3',
    list: 'grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm',
    label: 'text-[var(--visual-page-color)]',
    value: 'font-medium text-[var(--visual-page-color)]',
  },
  visual: {
    wrapper: 'border-t border-[var(--visual-global-border)]/10 mt-7 pt-6',
    title: 'mb-4 text-[10px] font-semibold uppercase tracking-[0.16em]',
    list: 'grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-[13px]',
    label: 'text-[var(--visual-page-color)]',
    value: 'text-[var(--visual-page-color)]',
  },
  catalog: {
    wrapper: 'border-t border-[var(--visual-global-border)]/10 mt-7 pt-6',
    title: 'mb-4 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--visual-page-color)]/75',
    list: 'grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-[12px]',
    label: 'text-[var(--visual-page-color)]/40',
    value: 'font-semibold text-[var(--visual-page-color)]',
  },
};


export function ProductAttributes({ slug, previewAttributes }: ProductAttributesProps) {
  const { template } = useStorefrontTemplate();
  const [atributos, setAtributos] = useState<AtributoGeneral[]>(previewAttributes ?? []);

  useEffect(() => {
    if (previewAttributes) { setAtributos(previewAttributes); return; }
    const controller = new AbortController();
    setAtributos([]);

    fetchProductoAtributos(slug, controller.signal)
      .then((data) => setAtributos(data?.atributos_generales ?? []))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('No se pudieron cargar los atributos del producto', error);
        }
      });

    return () => controller.abort();
  }, [slug, previewAttributes]);

  if (atributos.length === 0) return null;

  const styles = STYLES[template];

  return (
    <section className={styles.wrapper}>
      <h2 className={styles.title}>Características</h2>

      <dl className={styles.list}>
        {atributos.map((atributo) => (
          <div key={atributo.clave} className="contents">
            <dt className={styles.label}>{atributo.etiqueta || atributo.clave}</dt>
            <dd className={`m-0 ${styles.value}`}>{atributo.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
