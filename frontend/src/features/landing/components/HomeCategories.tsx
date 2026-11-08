import { Link } from 'react-router-dom';
import { useLandingContent } from '../hooks/useLandingContent';
import { useStore } from '../../storefront/context/StoreContext';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { VISUAL_SECTION } from '../../storefront/visual/sectionIds';

/** Category tiles reuse the existing landing selection and catalog routes. */
export function HomeCategories() {
  const {categories} = useLandingContent();
  const {landingProducts} = useStore();
  const {route} = useStorefrontTemplate();
  if (!categories.length) return null;
  return <section data-visual-section={VISUAL_SECTION.categories} data-landing-content className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
    <h2 className="font-display text-2xl sm:text-3xl mb-6">Explorar por categoría</h2>
    <div data-visual-part="categoryList" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{categories.map(category=>{
      const image=landingProducts.find(product=>product.category===category)?.images[0];
      return <Link key={category} data-visual-part="categoryItem" to={route(`catalogo?cat=${encodeURIComponent(category)}`)} className="group relative rounded-xl overflow-hidden aspect-square bg-[var(--muted)]">
        {image&&<img src={image} alt="" loading="lazy" className="w-full h-full object-cover" />}
        <span data-visual-part="categoryLabel" className="absolute inset-0 bg-black/40 flex items-end p-3 text-white font-semibold text-sm break-words">{category}</span>
      </Link>;
    })}</div>
  </section>;
}
