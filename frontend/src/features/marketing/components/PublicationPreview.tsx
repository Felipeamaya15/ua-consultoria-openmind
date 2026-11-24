import type { PaletteColors } from '../../../shared/palettes';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatMarketingMoney } from '../domain/content';
import { contrast, defaultDesign, designPalette, editorialProblem, FONT_FAMILIES, normalizeDesign, safeTextColor, type EditorialBlock, type TextBlock, type GalleryMode } from '../domain/editor';
import { FreeLayerCanvas, type LayerEditing } from './FreeLayers';
import { layerLayoutProblem } from '../services/layerLayout';
import { PUBLICATION_FORMATS, type PublicationContent, type PublicationDesign, type StoreBrand } from '../domain/types';


function activityDescription(value: string) {
  const details: { label: string; value: string }[] = [];
  const narrative: string[] = [];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const date = (raw: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!match) return raw.trim();
    const month = Number(match[2]);
    return month >= 1 && month <= 12
      ? `${Number(match[3])} de ${months[month - 1]} de ${match[1]}`
      : raw.trim();
  };
  const dateRange = (raw: string) => {
    const parts = raw.split(/\s+al\s+/i);
    return parts.length === 2
      ? parts[0].trim() === parts[1].trim()
        ? date(parts[0])
        : `${date(parts[0])} al ${date(parts[1])}`
      : date(raw);
  };
  const timeRange = (raw: string) => {
    const withoutZone = raw.replace(/\s*·\s*[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)*\s*$/, '');
    const compact = withoutZone.replace(/\b(\d{2}:\d{2}):00\b/g, '$1').trim();
    return /\d{2}:\d{2}/.test(compact) ? `${compact} h` : compact;
  };
  for (const part of value.split(/\n+/)) {
    const line = part.trim();
    if (!line) continue;
    const match = /^(Modalidad|Fecha|Horario|Duraci[oó]n|Requisitos|Condiciones|Ubicaci[oó]n):\s*(.+)$/i.exec(line);
    if (match) {
      const label = match[1].toLocaleLowerCase('es');
      const prettyLabel = label === 'duración' ? 'Duración' : label[0].toUpperCase() + label.slice(1);
      const detail = label === 'fecha' ? dateRange(match[2]) : label === 'horario' ? timeRange(match[2]) : match[2].trim();
      details.push({ label: prettyLabel, value: detail });
    } else {
      narrative.push(line);
    }
  }
  return { narrative: narrative.join('\n'), details };
}


function ActivityFactIcon({label}: {label: string}) {
  if (label.toLowerCase() === 'fecha') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>;
  if (label.toLowerCase() === 'horario' || label.toLowerCase() === 'duración') return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8"/></svg>;
}


export function PublicationPreview({ content, brand, design, paletteColors, images = [], onGalleryMode, layerEditing }: { layerEditing?: LayerEditing; paletteColors?:PaletteColors; content: PublicationContent; brand: StoreBrand; design: PublicationDesign; images?: readonly string[]; onGalleryMode?: (mode: GalleryMode) => void }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedGalleryImages, setFailedGalleryImages] = useState<string[]>([]);

  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const [fit, setFit] = useState({ scale: 1, blocked: false });
  const artRef = useRef<HTMLElement>(null);
  const [layerProblem, setLayerProblem] = useState<string | null>(null);
  const editor = normalizeDesign(design.editor || defaultDesign());
  const isActivity = content.category === 'Talleres' || content.category === 'Servicios';
  const campaign = editor.campaignLayout || 'classic';
  const professional = campaign !== 'classic';
  const classicActivity = isActivity && !professional;
  const immersive = campaign === 'immersive';
  const blank = campaign === 'blank';
  const activity = isActivity ? activityDescription(content.description || '') : null;
  const image = images[editor.imageIndex] || images[0] || content.image;
  const galleryImages = [...new Set([image, ...images, content.image].filter((src): src is string => !!src))]
    .filter(src => !failedGalleryImages.includes(src));
  const galleryMode = editor.galleryMode === 'auto' || !editor.galleryMode ? (isActivity ? 'collage' : 'single') : editor.galleryMode;
  const collage = galleryMode === 'collage' && galleryImages.length > 1;
  const hasImage = classicActivity || collage ? galleryImages.length > 0 : !!image && failedImage !== image;
  const featuredImages = (collage ? galleryImages.slice(0, 3) : galleryImages.slice(0, 1));
  const showMedia = hasImage && !blank;
  const hasLogo = editor.showLogo && !!brand.logo && failedLogo !== brand.logo;
  const palette = designPalette(brand.palette, editor, paletteColors);
  const shade = editor.campaignShade || '#211824';
  const shadeChannels = [1, 3, 5].map(i => parseInt(shade.slice(i, i + 2), 16));
  const shadeAlpha = (editor.campaignShadeStrength ?? 92) / 100;
  const blended = (under: number) => '#' + shadeChannels.map(v => Math.round(v * shadeAlpha + under * (1 - shadeAlpha)).toString(16).padStart(2, '0')).join('');
  const readable = (color: string) => contrast(color, blended(0)) >= 4.5 && contrast(color, blended(255)) >= 4.5;
  const shadeInk = readable('#ffffff') ? '#ffffff' : readable('#000000') ? '#000000' : safeTextColor(null, shade);
  const effectiveAlpha = readable(shadeInk) ? shadeAlpha : 1;
  const shadeFill = `rgba(${shadeChannels.join(',')},${effectiveAlpha})`;
  const campaignInk = (color: string | null) => effectiveAlpha === 1 ? safeTextColor(color, shade) : color && readable(color) ? color : shadeInk;
  const format = PUBLICATION_FORMATS.find(f => f.id === design.format)!;
  const signature = JSON.stringify([content, brand, design, images, hasImage, hasLogo, paletteColors, galleryMode]);
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !art.clientWidth) return;
      const copy = art.querySelector<HTMLElement>('.marketing-art-copy');
      const brandRow = art.querySelector<HTMLElement>('.marketing-art-brand')!;
      const fits = () => {
        const regularFits = art.scrollHeight <= art.clientHeight + 1 && art.scrollWidth <= art.clientWidth + 1
          && brandRow.scrollHeight <= brandRow.clientHeight + 1 && (!copy || copy.scrollHeight <= copy.clientHeight + 1)
          && [...art.querySelectorAll<HTMLElement>('.marketing-art-copy > *, .marketing-art-brand')].every(node => node.scrollWidth <= node.clientWidth + 1);
        if (!classicActivity) {
          if (!professional) return regularFits;
          const media = art.querySelector<HTMLElement>('.marketing-art-media');
          const area = art.getBoundingClientRect();


          const tolerance = 3;
          const inside = (node: HTMLElement, outer: DOMRect) => {
            const r = node.getBoundingClientRect();
            return r.left >= outer.left - tolerance && r.right <= outer.right + tolerance
              && r.top >= outer.top - tolerance && r.bottom <= outer.bottom + tolerance;
          };
          const fitsBox = (node: HTMLElement) => node.scrollWidth <= node.clientWidth + tolerance && node.scrollHeight <= node.clientHeight + tolerance;
          const visibleParts = [...art.querySelectorAll<HTMLElement>('.marketing-art-brand > *, .marketing-art-copy > *, .marketing-art-prices > *, .marketing-campaign-activity-fact, .marketing-campaign-activity-fact > *')].filter(node => node.getClientRects().length > 0);
          return (!media || (media.clientWidth >= art.clientWidth * .17 && media.clientHeight >= art.clientHeight * .17 && inside(media, area)))
            && inside(brandRow, area) && fitsBox(brandRow)
            && (!copy || (inside(copy, area) && fitsBox(copy)))
            && visibleParts.every(node => inside(node, area) && fitsBox(node));
        }
        const panels = [...art.querySelectorAll<HTMLElement>('.marketing-activity-head, .marketing-activity-footer, .marketing-activity-facts, .marketing-activity-fact-text, .marketing-activity-price, .marketing-activity-action')];
        const fitsPanel = (node: HTMLElement) => node.scrollHeight <= node.clientHeight + 2 && node.scrollWidth <= node.clientWidth + 2;
        const gallery = art.querySelector<HTMLElement>('.marketing-activity-gallery');
        const layout = art.querySelector<HTMLElement>('.marketing-activity-layout');

        return art.scrollHeight <= art.clientHeight + 2 && art.scrollWidth <= art.clientWidth + 2
          && fitsPanel(brandRow) && (!layout || fitsPanel(layout)) && panels.every(fitsPanel)
          && (!gallery || (gallery.clientHeight >= art.clientWidth * .20 && gallery.clientWidth >= art.clientWidth * .20));
      };
      let scale = 1;
      art.style.setProperty('--mk-fit', String(scale));
      while (!fits() && scale > .65) { scale = Math.max(.65, +(scale - .025).toFixed(3)); art.style.setProperty('--mk-fit', String(scale)); }
      setFit({ scale, blocked: !fits() });
      setLayerProblem(layerLayoutProblem(art));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(art);

    art.addEventListener('load', measure, true);
    art.addEventListener('error', measure, true);
    void document.fonts?.ready.then(() => { if (!disposed) measure(); });
    return () => { disposed = true; observer.disconnect(); art.removeEventListener('load', measure, true); art.removeEventListener('error', measure, true); };
  }, [signature]);
  const textStyle = (key: TextBlock): CSSProperties => ({ textAlign: editor.textStyles[key].align,
    fontWeight: editor.textStyles[key].bold ? key === 'price' ? editor.template === 'minimal' ? 600 : 800 : key === 'brand' ? 600 : 700 : 400, fontStyle: editor.textStyles[key].italic ? 'italic' : 'normal',
    ...((key === 'title' || key === 'heading') && editor.headingFont ? { fontFamily: FONT_FAMILIES[editor.headingFont] } : {}),
    color: campaign === 'commercial' && key === 'price' ? safeTextColor(editor.textStyles[key].color, palette.label) : immersive ? campaignInk(editor.textStyles[key].color) : safeTextColor(editor.textStyles[key].color || (key === 'brand' ? palette.text : palette.copyText), key === 'brand' ? palette.background : palette.copyBackground), '--mk-block-size': editor.textStyles[key].size / 100 } as CSSProperties);
  const editorial = (key: EditorialBlock) => !editorialProblem(editor[key]) ? editor[key].trim() : '';
  const appearance = editor.appearance;
  const proportional = (value: number | null) => value === null ? undefined : `${value}cqw`;
  const shadows = { none: 'none', soft: '0 .3cqw 1cqw #00000026', medium: '0 1cqw 2cqw #00000033', strong: '0 1.5cqw 3cqw #00000055' };
  const backgrounds = {
    plain: 'none',
    gradient: 'linear-gradient(145deg, #ffffff12 0%, transparent 52%, #0000000c 100%)',
    glow: 'radial-gradient(ellipse at 10% 4%, #ffffff1c 0%, transparent 64%)',
    pattern: 'repeating-linear-gradient(135deg, transparent 0px, transparent 15px, #ffffff09 15px, #ffffff09 16px)',
  };
  const artStyle: CSSProperties = {
    ...(editor.backgroundEffect && editor.backgroundEffect !== 'plain' ? { backgroundImage: backgrounds[editor.backgroundEffect] } : {}),
    borderRadius: proportional(appearance.radius), padding: proportional(appearance.padding), gap: proportional(appearance.gap),
    ...(appearance.borderStyle !== 'original' ? { border: `${appearance.borderWidth}px ${appearance.borderStyle} ${appearance.borderColor || palette.text}` } : {}),
    ...(appearance.shadow !== 'original' ? { boxShadow: shadows[appearance.shadow] } : {}),
  };
  const horizontal = design.format === 'banner' || editor.template === 'feature' && design.format !== 'story';
  const firstShare = editor.mediaSide === 'start' ? appearance.mediaShare : appearance.mediaShare === null ? null : 100 - appearance.mediaShare;
  const tracks = firstShare === null ? undefined : `minmax(0,${firstShare}fr) minmax(0,${100 - firstShare}fr)`;
  const compositionStyle: CSSProperties = { gap: proportional(appearance.gap), ...(!professional && hasImage ? horizontal ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks } : {}) };
  const buttonColor = appearance.buttonStyle === 'solid' ? safeTextColor(editor.textStyles.cta.color, palette.buttonBackground) : safeTextColor(editor.textStyles.cta.color || palette.copyText, palette.copyBackground);
  const buttonAlign = appearance.buttonAlign === 'inherit' ? editor.alignment : appearance.buttonAlign;
  const copyStyle: CSSProperties = {
    order: editor.mediaSide === 'start' ? 1 : 0, padding: proportional(appearance.copyPadding), gap: proportional(appearance.gap),
    background: immersive ? shadeFill : appearance.copyBackground || undefined, color: immersive ? shadeInk : palette.copyText, borderRadius: proportional(appearance.copyRadius),
    ...(appearance.copyBorderStyle !== 'original' ? { border: `${appearance.copyBorderWidth}px ${appearance.copyBorderStyle} ${appearance.copyBorderColor || palette.copyText}` } : {}),
    ...(appearance.copyShadow !== 'original' ? { boxShadow: shadows[appearance.copyShadow] } : {}),
  };
  const priceAlign = editor.textStyles.price.align === 'inherit' ? editor.alignment : editor.textStyles.price.align;
  const activityDetails = activity?.details || [];
  const activityCtaText = (editorial('cta') || 'Solicita información').replace(/^Solicita información en nuestra tienda$/i, 'Solicita información');
  const activityAlign = editor.alignment === 'right' ? 'flex-end' : editor.alignment === 'center' ? 'center' : 'flex-start';
  const activityPanelStyle: CSSProperties = {
    padding: proportional(appearance.copyPadding),
    background: appearance.copyBackground || undefined,
    borderRadius: proportional(appearance.copyRadius),
    ...(appearance.copyBorderStyle !== 'original'
      ? { border: `${appearance.copyBorderWidth}px ${appearance.copyBorderStyle} ${appearance.copyBorderColor || palette.copyText}` }
      : {}),
    ...(appearance.copyShadow !== 'original' ? { boxShadow: shadows[appearance.copyShadow] } : {}),
  };
  const activityCtaStyle: CSSProperties = {
    ...textStyle('cta'),
    color: appearance.buttonStyle === 'outline'
      ? safeTextColor(editor.textStyles.cta.color || palette.buttonBackground, palette.copyBackground)
      : safeTextColor(editor.textStyles.cta.color || palette.onAccent, palette.buttonBackground),
    background: appearance.buttonStyle === 'outline' ? 'transparent' : palette.buttonBackground,
    border: appearance.buttonStyle === 'outline'
      ? `${appearance.buttonBorderWidth}px ${appearance.buttonBorderStyle} ${appearance.buttonBorderColor || palette.buttonBackground}`
      : 'none',
    borderRadius: appearance.buttonShape === 'pill' ? '999px'
      : appearance.buttonShape === 'square' ? '0'
      : appearance.buttonShape === 'rounded' ? '2cqw' : proportional(appearance.buttonRadius),
    width: appearance.buttonFullWidth ? '100%' : appearance.buttonWidth === null ? 'fit-content' : `${appearance.buttonWidth}%`,
    paddingLeft: proportional(appearance.buttonPaddingX),
    paddingRight: proportional(appearance.buttonPaddingX),
    paddingTop: proportional(appearance.buttonPaddingY),
    paddingBottom: proportional(appearance.buttonPaddingY),
    justifySelf: buttonAlign === 'right' ? 'end' : buttonAlign === 'center' ? 'center' : 'start',
  };
  const galleryShare = appearance.mediaShare === null ? (design.format === 'banner' ? 43 : 52) : Math.min(82, Math.max(22, appearance.mediaShare));
  const activityGalleryStyle: CSSProperties = {
    borderRadius: proportional(appearance.imageRadius),
    background: appearance.copyBackground || undefined,
  };
  const activityPhotoStyle: CSSProperties = {
    objectFit: editor.fit,
    objectPosition: `${appearance.imageX ?? 50}% ${appearance.imageY ?? (editor.position === 'top' ? 0 : editor.position === 'bottom' ? 100 : 50)}%`,
    padding: proportional(appearance.imagePadding),
    transform: `scale(${editor.zoom / 100})`,
  };
  const activityTextStyle = (key: TextBlock): CSSProperties => ({
    ...textStyle(key),
    color: editor.textStyles[key].color ? textStyle(key).color : 'var(--mk-activity-ink)',
  });
  const variables = {
    '--mk-campaign-shade': shadeFill,
    '--mk-campaign-shade-solid': shade,
    '--mk-campaign-ink': shadeInk,
    '--mk-campaign-display': FONT_FAMILIES[editor.headingFont || (editor.font === 'sans' && campaign !== 'commercial' ? 'serif' : editor.font)],
    '--mk-campaign-media': `${appearance.mediaShare ?? 56}%`,
    '--mk-primary': palette.background, '--mk-secondary': palette.accent,
    '--mk-on-primary': palette.text, '--mk-on-secondary': palette.onAccent,
    '--mk-label': palette.label, '--mk-on-label': palette.onLabel, '--mk-fit': fit.scale,
    '--mk-activity-accent': palette.label, '--mk-activity-on-accent': palette.onLabel,
    '--mk-activity-paper': appearance.copyBackground || `color-mix(in srgb, ${palette.background} 7%, #fffdf8)`,
    '--mk-activity-ink': safeTextColor('#20372e', '#fffdf8'),
    '--mk-activity-photo-fr': `${galleryShare}fr`, '--mk-activity-info-fr': `${100 - galleryShare}fr`,
    fontFamily: FONT_FAMILIES[editor.font],
  } as CSSProperties;
  return <figure className="marketing-preview" aria-label="Vista previa de la publicación">
    <div className="marketing-preview-label"><span>Vista previa</span><span>{format.label} · {format.ratio}</span></div>
    {!blank && onGalleryMode && galleryImages.length > 1 && <div className="marketing-activity-view-switch" role="group" aria-label="Cómo mostrar las fotografías">
      <button type="button" aria-pressed={galleryMode === 'single'} onClick={() => onGalleryMode?.('single')}>Una fotografía</button>
      <button type="button" aria-pressed={galleryMode === 'collage'} onClick={() => onGalleryMode?.('collage')}>Collage ({Math.min(3, galleryImages.length)})</button>
    </div>}
    <div className="marketing-canvas" data-format={design.format} style={variables}>
      <article ref={artRef} className="marketing-art is-editable" data-format={design.format} data-image={showMedia ? 'present' : 'none'} data-campaign={campaign} data-layout={design.layout}
        style={artStyle}
        data-editorial-type={classicActivity ? 'activity' : 'regular'} data-activity-campaign={isActivity && professional} data-art-direction={professional ? 'original' : editor.artDirection || 'original'} data-template={editor.template} data-spacing={editor.spacing} data-align={editor.alignment} data-media-side={editor.mediaSide} data-blocked={fit.blocked}
        data-resource-error={!blank && !!image && !hasImage || editor.showLogo && !!brand.logo && !hasLogo}
        aria-label={`Publicación de ${content.productName} para ${brand.name}`}>
        <div className="marketing-art-brand">
          {hasLogo && <img src={brand.logo!} alt={`Logo de ${brand.name}`} style={{ height: proportional(appearance.logoSize) }} referrerPolicy="no-referrer" onError={() => setFailedLogo(brand.logo)} />}
          <span title={brand.name} style={classicActivity ? activityTextStyle('brand') : textStyle('brand')}>{brand.name}</span>
        </div>
        {classicActivity ? (
          <div className="marketing-art-composition marketing-activity-layout" style={{ gap: proportional(appearance.gap) }}>
            <div className="marketing-activity-head" style={{
              ...activityPanelStyle, alignItems: activityAlign, textAlign: editor.alignment,
            }}>
              <span className="marketing-activity-chip">{content.category === 'Talleres' ? 'TALLER' : 'SERVICIO'}</span>
              {editorial('heading') && <p className="marketing-art-heading" style={activityTextStyle('heading')}>{editorial('heading')}</p>}
              <h3 className="marketing-activity-title" style={activityTextStyle('title')}>{content.productName}</h3>
              {editor.showSubtitle && editorial('subtitle') && <p className="marketing-art-subtitle" style={activityTextStyle('subtitle')}>{editorial('subtitle')}</p>}
              {editor.showDescription && activity?.narrative && <p className="marketing-activity-description" style={activityTextStyle('description')}>{activity.narrative}</p>}
            </div>
            {hasImage && <div
              className={`marketing-activity-gallery ${collage ? 'is-collage' : 'is-single'} ${featuredImages.length === 2 ? 'is-two' : ''}`}
              style={activityGalleryStyle}
              aria-label={collage ? `Collage de ${featuredImages.length} fotografías` : 'Fotografía del taller o servicio'}>
              {featuredImages.map((src, index) => <div className="marketing-activity-photo" key={src}>
                <img src={src} alt={`${content.productName} · imagen ${index + 1}`}
                  referrerPolicy="no-referrer" style={activityPhotoStyle}
                  onError={() => setFailedGalleryImages(previous => previous.includes(src) ? previous : [...previous, src])} />
              </div>)}
            </div>}
            <div className="marketing-activity-footer" style={activityPanelStyle}>
              {!content.hidePrice && (
                <p className="marketing-art-price marketing-activity-price" style={activityTextStyle('price')}>
                  {formatMarketingMoney(content.price)}
                </p>
              )}
              <div className="marketing-activity-facts" style={{
                textAlign: editor.alignment,
                '--mk-block-size': editor.textStyles.description.size / 100,
              } as CSSProperties} aria-label="Datos del taller o servicio">
                {editor.showDescription && activityDetails.map((detail, index) => <div className="marketing-activity-fact" data-detail={detail.value.length > 42 || /^(requisitos|condiciones|ubicaci[oó]n)$/i.test(detail.label) ? 'wide' : 'short'} key={`${detail.label}-${index}`}>
                  <ActivityFactIcon label={detail.label} />
                  <div className="marketing-activity-fact-text">
                    <span>{detail.label}</span><strong>{detail.value}</strong>
                  </div>
                </div>)}
              </div>
              {appearance.showButton && <p className="marketing-activity-action" style={activityCtaStyle} data-full-width={appearance.buttonFullWidth}>
                {activityCtaText}<span aria-hidden="true">↗</span>
              </p>}
            </div>
          </div>
        ) : (
        <div className="marketing-art-composition" style={compositionStyle}>
          {showMedia && <div className={`marketing-art-media${collage ? ` marketing-product-collage${featuredImages.length === 2 ? ' is-two' : ''}` : ''}`} style={{ order: editor.mediaSide === 'start' ? 0 : 1, borderRadius: proportional(appearance.imageRadius) }}>
            {collage ? featuredImages.map((src, index) => <div className="marketing-product-photo" key={src}><img src={src} alt={`${content.productName} · imagen ${index + 1}`} referrerPolicy="no-referrer" style={activityPhotoStyle} onError={() => setFailedGalleryImages(previous => previous.includes(src) ? previous : [...previous, src])}/></div>) : <img key={image} src={image!} alt={content.productName} referrerPolicy="no-referrer" style={activityPhotoStyle} onError={() => setFailedImage(image)} />}
          </div>}
          {immersive && showMedia && <div className="marketing-campaign-shade" aria-hidden="true" />}
          <div className="marketing-art-copy" style={copyStyle}>
            {content.category && <p className="marketing-art-category">{content.category}</p>}
            {editorial('heading') && <p className="marketing-art-heading" style={textStyle('heading')}>{editorial('heading')}</p>}
            <h3 className="marketing-art-title" style={textStyle('title')} title={content.productName}>{content.productName}</h3>
            {editor.showSubtitle && editorial('subtitle') && <p className="marketing-art-subtitle" style={textStyle('subtitle')}>{editorial('subtitle')}</p>}
            {isActivity ? <>
              {editor.showDescription && activity?.narrative && <p className="marketing-art-description" style={textStyle('description')}>{activity.narrative}</p>}
              {!!activityDetails.length && <div className="marketing-campaign-activity-facts" style={textStyle('description')} aria-label="Información de la actividad">
                {activityDetails.map((detail, index) => <div className="marketing-campaign-activity-fact" data-wide={detail.value.length > 42 || /^(requisitos|condiciones|ubicaci[oó]n)$/i.test(detail.label)} key={`${detail.label}-${index}`}>
                  <span>{detail.label}</span><strong>{detail.value}</strong>
                </div>)}
              </div>}
            </> : editor.showDescription && content.description?.trim() && <p className="marketing-art-description" style={textStyle('description')}>{content.description}</p>}
            {content.discountLabel && <p className="marketing-art-offer">{content.discountLabel}{content.hasMultipleVariants && <span> en esta variante</span>}</p>}
            {!content.hidePrice&&<div className="marketing-art-prices" style={{ justifyContent: priceAlign === 'right' ? 'flex-end' : priceAlign === 'center' ? 'center' : 'flex-start' }}>
              {content.originalPrice !== null && <p className="marketing-art-original"><span>Precio regular </span><s>{formatMarketingMoney(content.originalPrice)}</s></p>}
              <p className="marketing-art-price" style={textStyle('price')}>{content.fromPrice && <span>Desde </span>}{formatMarketingMoney(content.price)}</p>
            </div>}
            {content.hasMultipleVariants && editor.showVariant !== false && <p className="marketing-art-variant" style={textStyle('variant')} title={content.variantLabel}>{content.variantLabel}</p>}
            {appearance.showButton && <p className="marketing-art-cta" data-campaign-cta={professional && appearance.buttonStyle === 'solid' && appearance.buttonShape === 'original' && appearance.buttonBackground === null && appearance.buttonRadius === null && appearance.buttonWidth === null && appearance.buttonPaddingX === null && appearance.buttonPaddingY === null && editor.textStyles.cta.color === null && appearance.buttonFullWidth ? 'editorial' : 'custom'} style={{ ...textStyle('cta'), color: buttonColor,
              background: appearance.buttonStyle === 'solid' ? palette.buttonBackground : 'transparent',
              border: appearance.buttonStyle === 'outline' ? `${appearance.buttonBorderWidth}px ${appearance.buttonBorderStyle} ${safeTextColor(appearance.buttonBorderColor || buttonColor, palette.copyBackground)}` : 'none',
              alignSelf: buttonAlign === 'right' ? 'flex-end' : buttonAlign === 'center' ? 'center' : 'flex-start',
              width: appearance.buttonFullWidth ? '100%' : appearance.buttonWidth === null ? 'fit-content' : `${appearance.buttonWidth}%`,
              borderRadius: appearance.buttonShape === 'pill' ? '999px' : appearance.buttonShape === 'square' ? '0' : appearance.buttonShape === 'rounded' ? '2cqw' : proportional(appearance.buttonRadius),
              paddingLeft: proportional(appearance.buttonPaddingX), paddingRight: proportional(appearance.buttonPaddingX),
              paddingTop: proportional(appearance.buttonPaddingY), paddingBottom: proportional(appearance.buttonPaddingY),
            }}>{isActivity ? activityCtaText : editorial('cta') || 'Disponible en nuestra tienda'} <span aria-hidden="true">↗</span></p>}
          </div>
        </div>
        )}
        <FreeLayerCanvas layers={editor.layers || []} images={images} editing={layerEditing} />
      </article>
    </div>
    {layerProblem && <p role="alert" className="marketing-editor-warning">{layerProblem}</p>}
    {fit.blocked && <p role="alert" className="marketing-editor-warning">{isActivity
      ? 'Hay información que podría quedar recortada. Prueba un formato vertical, reduce el texto o ajusta el tamaño y el espaciado.'
      : 'Esta combinación no cabe de forma legible. Acorta los textos opcionales, reduce su tamaño, usa espaciado compacto o cambia a historia. La exportación está bloqueada para evitar recortes; la vista previa sigue disponible para que puedas corregirla.'}</p>}
    {!fit.blocked && fit.scale < 1 && <p role="status" className="marketing-hint">Se ajustó la tipografía para mostrar todo el contenido sin recortes.</p>}
    <figcaption className="marketing-preview-caption">
      <strong>{content.productName}</strong>
      <span>{content.hidePrice?content.category:<>{content.variantLabel} · {content.fromPrice ? 'Desde ' : ''}{formatMarketingMoney(content.price)} CLP</>}</span>
      {!blank && !hasImage && <span role="status">{image ? 'No pudimos cargar la imagen. Se muestra una composición de texto.' : 'Este producto no tiene imagen. Se muestra una composición de texto.'}</span>}
      {editor.showLogo && brand.logo && !hasLogo && <span role="status">No pudimos cargar el logo. Se conserva el nombre de tu tienda.</span>}
    </figcaption>
  </figure>;
}
