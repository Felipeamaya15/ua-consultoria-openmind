import { useEffect, useState } from 'react';

import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import {
  fetchProductoAtributos,
  type AtributoGeneral,
} from '../../services/productAttributesService';

interface ProductAttributesProps {
  slug: string;
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
    wrapper: 'border-t border-black/5 pt-5',
    title: 'text-base font-semibold mb-3',
    list: 'grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm',
    label: 'text-gray-400',
    value: 'font-medium text-[#171717]',
  },
  visual: {
    wrapper: 'border-t border-black/10 mt-7 pt-6',
    title: 'mb-4 text-[10px] font-semibold uppercase tracking-[0.16em]',
    list: 'grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-[13px]',
    label: 'text-[#8c8683]',
    value: 'text-[#111111]',
  },
  catalog: {
    wrapper: 'border-t border-white/10 mt-7 pt-6',
    title: 'mb-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/75',
    list: 'grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-[12px]',
    label: 'text-white/40',
    value: 'font-semibold text-white',
  },
};


export function ProductAttributes({ slug }: ProductAttributesProps) {
  const { template } = useStorefrontTemplate();
  const [atributos, setAtributos] = useState<AtributoGeneral[]>([]);

  useEffect(() => {
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
  }, [slug]);

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