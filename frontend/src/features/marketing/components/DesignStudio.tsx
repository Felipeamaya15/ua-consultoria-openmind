import { usePaletteLibrary } from '../../../shared/palettes';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { designPalette, type DesignAction, type TemplateHistory } from '../domain/editor';
import type { PublicationContent, PublicationDesign, StoreBrand } from '../domain/types';
import { DesignControls } from './DesignControls';
import { PublicationPreview } from './PublicationPreview';
import { FreeLayerControls, type LayerEditing } from './FreeLayers';

interface Props { sourceData: PublicationContent | null; brandData: StoreBrand | null; design: PublicationDesign; images: readonly string[]; selection: ReactNode; notices: ReactNode; empty: ReactNode; sourceKey: string;
  session: TemplateHistory; onAction: (action: DesignAction) => void; previewRef: RefObject<HTMLDivElement>; busy: boolean }
/** Solo el documento cambia de sesión; la búsqueda del selector conserva su estado. */
export function DesignStudio({ sourceData, brandData, design, images, notices, empty, session, onAction: dispatch, selection, sourceKey, previewRef, busy }: Props) {
  const {library}=usePaletteLibrary();
  const history = session.documents[session.active];
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [sourceKey, session.active]);
  const editing: LayerEditing = { selected, select: setSelected, change: layers => dispatch({ type: 'change', next: { ...history.present, layers } }) };
  const paletteColors=[...(library?.sistema??[]),...(library?.compatibles??[]),...(library?.propias??[])].find(palette=>palette.id===history.present.paletteId)?.colores;
  useEffect(()=>{if(library&&history.present.paletteId&&![...library.sistema,...(library.compatibles??[]),...library.propias].some(palette=>palette.id===history.present.paletteId))dispatch({type:'change',next:{...history.present,paletteId:null}});},[library,history.present.paletteId]);
  const palette = brandData ? designPalette(brandData.palette, history.present, paletteColors) : null;
  return <div ref={node => { if (node) node.inert = busy; }} className="marketing-workspace marketing-studio">{selection}
    <div className="marketing-preview-panel" ref={previewRef}>{notices}{sourceData && brandData ? <PublicationPreview key={`${sourceKey}:${session.active}:${design.format}`} layerEditing={editing} paletteColors={paletteColors} content={sourceData} brand={brandData} design={{ ...design, editor: history.present }} images={images} onGalleryMode={galleryMode => dispatch({ type: 'change', next: { ...history.present, galleryMode } })} /> : empty}</div>
    {sourceData && brandData && <DesignControls activity={sourceData.category === 'Talleres' || sourceData.category === 'Servicios'} freeLayers={palette && <FreeLayerControls layers={history.present.layers || []} images={images} editing={editing} accent={palette.accent} textColor={palette.text} />} paletteColors={paletteColors} key={sourceKey} value={history.present} brand={brandData} images={images} hasDescription={!!sourceData.description?.trim()} onChange={next => dispatch({ type: 'change', next })}
      onReset={() => dispatch({ type: 'reset' })} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} canUndo={!!history.past.length} canRedo={!!history.future.length} />
    }
  </div>;
}
