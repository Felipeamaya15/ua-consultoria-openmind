import { useStore } from '../../storefront/context/StoreContext';
import { useStorefrontTemplate } from '../../storefront/hooks/useStorefrontTemplate';
import { blockStyleSheet } from '../../storefront/visual/blockAppearance';
import './landing-blocks.css';

/** The same store content is rendered in every template; design stays template scoped. */
export function LandingBlocks({ onlyHistory = false }: { onlyHistory?: boolean }) {
  const { landing, blockStyles } = useStore();
  const { template } = useStorefrontTemplate();
  const blocks = landing?.contenido?.bloques?.filter(block => block.visible && (!onlyHistory || block.tipo === 'historia')) ?? [];
  return <><style data-block-appearance>{blockStyleSheet(blockStyles)}</style><div className="store-content-blocks" data-block-template={template}>
    {blocks.map(block => <section key={block.id} data-content-block-id={block.id} data-block-type={block.tipo} data-landing-content data-visual-section="sections" className={`store-content-block ${block.imagenes.length ? 'has-images' : ''}`} aria-label={block.titulo || 'Sección de la tienda'}>
      {!!block.imagenes.length && <div className={block.tipo === 'galeria' ? 'store-block-gallery' : 'store-block-media'}>{block.imagenes.map(image => <figure key={image.id}><div className="store-block-image-frame"><img src={image.src} alt={image.alt} loading="lazy" /></div>{block.tipo === 'galeria' && image.alt && <figcaption>{image.alt}</figcaption>}</figure>)}</div>}
      <div className="store-block-copy">{block.subtitulo && <p className="store-block-subtitle">{block.subtitulo}</p>}{block.titulo && <h2 className="store-block-title">{block.titulo}</h2>}{block.texto && (block.tipo === 'cita' ? <blockquote className="store-block-body">{block.texto}</blockquote> : <div className="store-block-body">{block.texto.split(/\n\s*\n/).map((paragraph,index) => <p key={index}>{paragraph}</p>)}</div>)}</div>
    </section>)}
  </div></>;
}
