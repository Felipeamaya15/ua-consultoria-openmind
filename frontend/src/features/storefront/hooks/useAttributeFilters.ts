import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Product } from '../data/mockData';

export interface AttributeGroup {
  name: string;
  options: string[];
}

export type AttributeSelection = Record<string, string[]>;


export function buildAttributeGroups(products: Product[]): AttributeGroup[] {
  const groups = new Map<string, string[]>();

  for (const product of products) {
    for (const [name, values] of Object.entries(product.attributes)) {
      const options = groups.get(name) ?? [];
      for (const value of values) {
        if (!options.includes(value)) options.push(value);
      }
      groups.set(name, options);
    }
  }

  return Array.from(groups, ([name, options]) => ({ name, options }));
}

export function matchesAttributeSelection(
  product: Product,
  selection: AttributeSelection,
): boolean {
  const active = Object.entries(selection).filter(([, values]) => values.length > 0);
  if (active.length === 0) return true;

  return product.variants.some((variant) =>
    active.every(([name, values]) => values.includes(variant.attributes[name])),
  );
}

export function useAttributeFilters(products: Product[], category: string) {
  const [selected, setSelected] = useState<AttributeSelection>({});

  const groups = useMemo(
    () =>
      buildAttributeGroups(
        products.filter(
          (product) =>
            product.status === 'active' &&
            (category === 'Todos' || product.category === category),
        ),
      ),
    [products, category],
  );

  useEffect(() => {
    setSelected((previous) => (Object.keys(previous).length > 0 ? {} : previous));
  }, [category]);

  const toggle = useCallback((name: string, value: string) => {
    setSelected((previous) => {
      const current = previous[name] ?? [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      const updated = { ...previous };
      if (next.length > 0) updated[name] = next;
      else delete updated[name];
      return updated;
    });
  }, []);

  const clear = useCallback(() => setSelected({}), []);

  const matches = useCallback(
    (product: Product) => matchesAttributeSelection(product, selected),
    [selected],
  );

  const count = useMemo(
    () => Object.values(selected).reduce((total, values) => total + values.length, 0),
    [selected],
  );

  return { groups, selected, count, toggle, clear, matches };
}