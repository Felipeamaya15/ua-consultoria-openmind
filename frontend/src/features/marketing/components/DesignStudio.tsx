import { type ReactNode, type RefObject } from 'react';
import { type DesignAction, type TemplateHistory } from '../domain/editor';
import type { PublicationContent, PublicationDesign, StoreBrand } from '../domain/types';
import { DesignControls } from './DesignControls';
import { PublicationPreview } from './PublicationPreview';

interface Props { sourceData: PublicationContent | null; brandData: StoreBrand | null; design: PublicationDesign; images: readonly string[]; selection: ReactNode; notices: ReactNode; empty: ReactNode; sourceKey: string;
  session: TemplateHistory; onAction: (action: DesignAction) => void; previewRef: RefObject<HTMLDivElement>; busy: boolean }
/** Solo el documento cambia de sesión; la búsqueda del selector conserva su estado. */
export function DesignStudio({ sourceData, brandData, design, images, notices, empty, session, onAction: dispatch, selection, sourceKey, previewRef, busy }: Props) {
  const history = session.documents[session.active];
  return <div ref={node => { if (node) node.inert = busy; }} className="marketing-workspace marketing-studio">{selection}
    <div className="marketing-preview-panel" ref={previewRef}>{notices}{sourceData && brandData ? <PublicationPreview content={sourceData} brand={brandData} design={{ ...design, editor: history.present }} images={images} /> : empty}</div>
    {sourceData && brandData && <DesignControls key={sourceKey} value={history.present} brand={brandData} images={images} hasDescription={!!sourceData.description?.trim()} onChange={next => dispatch({ type: 'change', next })}
      onReset={() => dispatch({ type: 'reset' })} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} canUndo={!!history.past.length} canRedo={!!history.future.length} />
    }
  </div>;
}
