import type { BloqueLanding } from './landing.types';

/** Stable identities preserve style settings when restoring a removed default. */
export const DEFAULT_STORY_BLOCKS: BloqueLanding[] = [
  {
    id:'706d696e-6400-4000-8000-000000000001', tipo:'historia', visible:true,
    titulo:'Nacido de una idea,\nconstruido con criterio',
    subtitulo:'Una selección en constante evolución · Nuestra historia',
    texto:'Encontrar productos de calidad no debería ser complicado. Por eso reunimos una selección de productos para que puedas explorar el catálogo y elegir con información clara.\n\nCada producto pasa por una selección estricta. Si no cumple con los estándares de calidad, diseño y durabilidad que exigimos, no entra al catálogo. Así de simple.\n\nNuestra forma de elegir',
    imagenes:[{id:'706d696e-6400-4000-8000-000000000011',src:'https://images.unsplash.com/photo-1643168343279-3f93c2e592ef?w=800&h=1000&fit=crop&auto=format',alt:'Selección de productos'}],
  },
  {
    id:'706d696e-6400-4000-8000-000000000002', tipo:'historia', visible:true,
    titulo:'Un catálogo que crece\ncon intención', subtitulo:'Nuestro espacio',
    texto:'Trabajamos con proveedores y marcas que comparten la misma idea: que un producto bien elegido vale más que diez comprados sin criterio. Cada categoría se revisa y actualiza de forma constante.\n\nTenés dudas o querés conocernos mejor — escribinos. Respondemos todas las consultas.',
    imagenes:[{id:'706d696e-6400-4000-8000-000000000012',src:'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=900&h=700&fit=crop&auto=format',alt:'Espacio comercial'}],
  },
];
export const defaultStoryBlocks = () => DEFAULT_STORY_BLOCKS.map(block => ({...block,imagenes:block.imagenes.map(image => ({...image}))}));
/** First management must materialize existing stories, never silently replace them. */
export const editableLandingBlocks = (blocks?: BloqueLanding[]) => blocks ?? defaultStoryBlocks();
export function restoreStoryBlocks(blocks?: BloqueLanding[]): BloqueLanding[] {
  const current = editableLandingBlocks(blocks);
  const ids = new Set(current.map(block => block.id));
  return [...current,...defaultStoryBlocks().filter(block => !ids.has(block.id))];
}
