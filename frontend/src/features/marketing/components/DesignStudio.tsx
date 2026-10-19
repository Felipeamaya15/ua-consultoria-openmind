import { useReducer, type ReactNode } from 'react';
import { templateHistory, initialTemplateHistory } from '../domain/editor';
import type { PublicationContent, PublicationDesign, StoreBrand } from '../domain/types';
import { DesignControls } from './DesignControls';
import { PublicationPreview } from './PublicationPreview';

interface Props { sourceData: PublicationContent | null; brandData: StoreBrand | null; design: PublicationDesign; images: readonly string[]; selection: ReactNode; notices: ReactNode; empty: ReactNode; sourceKey: string }
/** Solo el documento cambia de sesión; la búsqueda del selector conserva su estado. */
export function DesignStudio(props: Props) {
  return <div className="marketing-workspace marketing-studio">{props.selection}<DesignSession key={props.sourceKey} {...props} /></div>;
}
/** La clave de montaje es producto/origen: nunca arrastra texto, recursos ni historial entre productos. */
function DesignSession({ sourceData, brandData, design, images, notices, empty }: Props) {
  const [session, dispatch] = useReducer(templateHistory, undefined, initialTemplateHistory);
  const history = session.documents[session.active];
  return <>
    <div className="marketing-preview-panel">{notices}{sourceData && brandData ? <PublicationPreview content={sourceData} brand={brandData} design={{ ...design, editor: history.present }} images={images} /> : empty}</div>
    {sourceData && brandData && <DesignControls value={history.present} brand={brandData} images={images} hasDescription={!!sourceData.description?.trim()} onChange={next => dispatch({ type: 'change', next })}
      onReset={() => dispatch({ type: 'reset' })} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} canUndo={!!history.past.length} canRedo={!!history.future.length} />
    }
  </>;
}
