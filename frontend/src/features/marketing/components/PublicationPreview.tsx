import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatMarketingMoney } from '../domain/content';
import { defaultDesign, designPalette, editorialProblem, FONT_FAMILIES, normalizeDesign, safeTextColor, type EditorialBlock, type TextBlock } from '../domain/editor';
import { PUBLICATION_FORMATS, type PublicationContent, type PublicationDesign, type StoreBrand } from '../domain/types';

/** Render compartido por la vista previa y su captura de exportación; no consulta ni guarda. */
export function PublicationPreview({ content, brand, design, images = [] }: { content: PublicationContent; brand: StoreBrand; design: PublicationDesign; images?: readonly string[] }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const [fit, setFit] = useState({ scale: 1, blocked: false });
  const artRef = useRef<HTMLElement>(null);
  const editor = normalizeDesign(design.editor || defaultDesign());
  const image = images[editor.imageIndex] || images[0] || content.image;
  const hasImage = !!image && failedImage !== image;
  const hasLogo = editor.showLogo && !!brand.logo && failedLogo !== brand.logo;
  const palette = designPalette(brand.palette, editor);
  const format = PUBLICATION_FORMATS.find(f => f.id === design.format)!;
  const signature = JSON.stringify([content, brand, design, images, hasImage, hasLogo]);
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !art.clientWidth) return;
      const copy = art.querySelector<HTMLElement>('.marketing-art-copy')!;
      const brandRow = art.querySelector<HTMLElement>('.marketing-art-brand')!;
      const fits = () => art.scrollHeight <= art.clientHeight + 1 && art.scrollWidth <= art.clientWidth + 1
        && brandRow.scrollHeight <= brandRow.clientHeight + 1 && copy.scrollHeight <= copy.clientHeight + 1
        && [...art.querySelectorAll<HTMLElement>('.marketing-art-copy > *, .marketing-art-brand')].every(node => node.scrollWidth <= node.clientWidth + 1);
      let scale = 1;
      art.style.setProperty('--mk-fit', String(scale));
      while (!fits() && scale > .65) { scale = Math.max(.65, +(scale - .025).toFixed(3)); art.style.setProperty('--mk-fit', String(scale)); }
      setFit({ scale, blocked: !fits() });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(art);
    void document.fonts?.ready.then(() => { if (!disposed) measure(); });
    return () => { disposed = true; observer.disconnect(); };
  }, [signature]);
  const textStyle = (key: TextBlock): CSSProperties => ({ textAlign: editor.textStyles[key].align,
    fontWeight: editor.textStyles[key].bold ? key === 'price' ? editor.template === 'minimal' ? 600 : 800 : key === 'brand' ? 600 : 700 : 400, fontStyle: editor.textStyles[key].italic ? 'italic' : 'normal',
    ...((key === 'title' || key === 'heading') && editor.headingFont ? { fontFamily: FONT_FAMILIES[editor.headingFont] } : {}),
    color: safeTextColor(editor.textStyles[key].color || (key === 'brand' ? palette.text : palette.copyText), key === 'brand' ? palette.background : palette.copyBackground), '--mk-block-size': editor.textStyles[key].size / 100 } as CSSProperties);
  const editorial = (key: EditorialBlock) => !editorialProblem(editor[key]) ? editor[key].trim() : '';
  const appearance = editor.appearance;
  const proportional = (value: number | null) => value === null ? undefined : `${value}cqw`;
  const shadows = { none: 'none', soft: '0 .3cqw 1cqw #00000026', medium: '0 1cqw 2cqw #00000033', strong: '0 1.5cqw 3cqw #00000055' };
  const artStyle: CSSProperties = {
    borderRadius: proportional(appearance.radius), padding: proportional(appearance.padding), gap: proportional(appearance.gap),
    ...(appearance.borderStyle !== 'original' ? { border: `${appearance.borderWidth}px ${appearance.borderStyle} ${appearance.borderColor || palette.text}` } : {}),
    ...(appearance.shadow !== 'original' ? { boxShadow: shadows[appearance.shadow] } : {}),
  };
  const horizontal = design.format === 'banner' || editor.template === 'feature' && design.format !== 'story';
  const firstShare = editor.mediaSide === 'start' ? appearance.mediaShare : appearance.mediaShare === null ? null : 100 - appearance.mediaShare;
  const tracks = firstShare === null ? undefined : `minmax(0,${firstShare}fr) minmax(0,${100 - firstShare}fr)`;
  const compositionStyle: CSSProperties = { gap: proportional(appearance.gap), ...(hasImage ? horizontal ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks } : {}) };
  const buttonColor = appearance.buttonStyle === 'solid' ? safeTextColor(editor.textStyles.cta.color, palette.buttonBackground) : safeTextColor(editor.textStyles.cta.color || palette.copyText, palette.copyBackground);
  const buttonAlign = appearance.buttonAlign === 'inherit' ? editor.alignment : appearance.buttonAlign;
  const copyStyle: CSSProperties = {
    order: editor.mediaSide === 'start' ? 1 : 0, padding: proportional(appearance.copyPadding), gap: proportional(appearance.gap),
    background: appearance.copyBackground || undefined, color: palette.copyText, borderRadius: proportional(appearance.copyRadius),
    ...(appearance.copyBorderStyle !== 'original' ? { border: `${appearance.copyBorderWidth}px ${appearance.copyBorderStyle} ${appearance.copyBorderColor || palette.copyText}` } : {}),
    ...(appearance.copyShadow !== 'original' ? { boxShadow: shadows[appearance.copyShadow] } : {}),
  };
  const priceAlign = editor.textStyles.price.align === 'inherit' ? editor.alignment : editor.textStyles.price.align;
  const variables = {
    '--mk-primary': palette.background, '--mk-secondary': palette.accent,
    '--mk-on-primary': palette.text, '--mk-on-secondary': palette.onAccent,
    '--mk-label': palette.label, '--mk-on-label': palette.onLabel, '--mk-fit': fit.scale,
    fontFamily: FONT_FAMILIES[editor.font],
  } as CSSProperties;
  return <figure className="marketing-preview" aria-label="Vista previa de la publicación">
    <div className="marketing-preview-label"><span>Vista previa</span><span>{format.label} · {format.ratio}</span></div>
    <div className="marketing-canvas" data-format={design.format} style={variables}>
      <article ref={artRef} className="marketing-art is-editable" data-format={design.format} data-image={hasImage ? 'present' : 'none'} data-layout={design.layout}
        style={artStyle}
        data-template={editor.template} data-spacing={editor.spacing} data-align={editor.alignment} data-media-side={editor.mediaSide} data-blocked={fit.blocked}
        data-resource-error={!!image && !hasImage || editor.showLogo && !!brand.logo && !hasLogo}
        aria-label={`Publicación de ${content.productName} para ${brand.name}`}>
        <div className="marketing-art-brand">
          {hasLogo && <img src={brand.logo!} alt={`Logo de ${brand.name}`} style={{ height: proportional(appearance.logoSize) }} referrerPolicy="no-referrer" onError={() => setFailedLogo(brand.logo)} />}
          <span title={brand.name} style={textStyle('brand')}>{brand.name}</span>
        </div>
        <div className="marketing-art-composition" style={compositionStyle}>
          {hasImage && <div className="marketing-art-media" style={{ order: editor.mediaSide === 'start' ? 0 : 1, borderRadius: proportional(appearance.imageRadius) }}><img key={image} src={image!} alt={content.productName} referrerPolicy="no-referrer" style={{ objectFit: editor.fit, objectPosition: `${appearance.imageX ?? 50}% ${appearance.imageY ?? (editor.position === 'top' ? 0 : editor.position === 'bottom' ? 100 : 50)}%`, padding: proportional(appearance.imagePadding), transform: `scale(${editor.zoom / 100})` }} onError={() => setFailedImage(image)} /></div>}
          <div className="marketing-art-copy" style={copyStyle}>
            {content.category && <p className="marketing-art-category">{content.category}</p>}
            {editorial('heading') && <p className="marketing-art-heading" style={textStyle('heading')}>{editorial('heading')}</p>}
            <h3 className="marketing-art-title" style={textStyle('title')} title={content.productName}>{content.productName}</h3>
            {editor.showSubtitle && editorial('subtitle') && <p className="marketing-art-subtitle" style={textStyle('subtitle')}>{editorial('subtitle')}</p>}
            {editor.showDescription && content.description?.trim() && <p className="marketing-art-description" style={textStyle('description')}>{content.description}</p>}
            {content.discountLabel && <p className="marketing-art-offer">{content.discountLabel}{content.hasMultipleVariants && <span> en esta variante</span>}</p>}
            <div className="marketing-art-prices" style={{ justifyContent: priceAlign === 'right' ? 'flex-end' : priceAlign === 'center' ? 'center' : 'flex-start' }}>
              {content.originalPrice !== null && <p className="marketing-art-original"><span>Precio regular </span><s>{formatMarketingMoney(content.originalPrice)}</s></p>}
              <p className="marketing-art-price" style={textStyle('price')}>{content.fromPrice && <span>Desde </span>}{formatMarketingMoney(content.price)}</p>
            </div>
            {content.hasMultipleVariants && <p className="marketing-art-variant" style={textStyle('variant')} title={content.variantLabel}>{content.variantLabel}</p>}
            {appearance.showButton && <p className="marketing-art-cta" style={{ ...textStyle('cta'), color: buttonColor,
              background: appearance.buttonStyle === 'solid' ? palette.buttonBackground : 'transparent',
              border: appearance.buttonStyle === 'outline' ? `${appearance.buttonBorderWidth}px ${appearance.buttonBorderStyle} ${safeTextColor(appearance.buttonBorderColor || buttonColor, palette.copyBackground)}` : 'none',
              alignSelf: buttonAlign === 'right' ? 'flex-end' : buttonAlign === 'center' ? 'center' : 'flex-start',
              width: appearance.buttonFullWidth ? '100%' : appearance.buttonWidth === null ? 'fit-content' : `${appearance.buttonWidth}%`,
              borderRadius: appearance.buttonShape === 'pill' ? '999px' : appearance.buttonShape === 'square' ? '0' : appearance.buttonShape === 'rounded' ? '2cqw' : proportional(appearance.buttonRadius),
              paddingLeft: proportional(appearance.buttonPaddingX), paddingRight: proportional(appearance.buttonPaddingX),
              paddingTop: proportional(appearance.buttonPaddingY), paddingBottom: proportional(appearance.buttonPaddingY),
            }}>{editorial('cta') || 'Disponible en nuestra tienda'} <span aria-hidden="true">↗</span></p>}
          </div>
        </div>
      </article>
    </div>
    {fit.blocked && <p role="alert" className="marketing-editor-warning">Esta combinación no cabe de forma legible. Acorta los textos opcionales, reduce su tamaño, usa espaciado compacto o cambia a historia. La pieza está bloqueada para evitar recortes.</p>}
    {!fit.blocked && fit.scale < 1 && <p role="status" className="marketing-hint">Se ajustó la tipografía para mostrar todo el contenido sin recortes.</p>}
    <figcaption className="marketing-preview-caption">
      <strong>{content.productName}</strong>
      <span>{content.variantLabel} · {content.fromPrice ? 'Desde ' : ''}{formatMarketingMoney(content.price)} CLP</span>
      {!hasImage && <span role="status">{image ? 'No pudimos cargar la imagen. Se muestra una composición de texto.' : 'Este producto no tiene imagen. Se muestra una composición de texto.'}</span>}
      {editor.showLogo && brand.logo && !hasLogo && <span role="status">No pudimos cargar el logo. Se conserva el nombre de tu tienda.</span>}
    </figcaption>
  </figure>;
}
