import { useId, type ReactNode } from 'react';
import { useAdminHelp } from '../context/AdminHelpContext';

export function AdminPageHeader({ title, description, help, action }: { title: string; description: string; help?: ReactNode; action?: ReactNode }) {
  const { showHelp, toggleHelp } = useAdminHelp();
  const id = useId();
  return <section className="admin-page-intro" aria-label={title}>
    <div className="admin-page-intro-heading"><h2>{title}</h2><div className="admin-page-intro-actions">{action}<button type="button" onClick={toggleHelp} aria-expanded={showHelp} aria-controls={id}>{showHelp ? 'Ocultar ayudas' : 'Mostrar ayudas'}</button></div></div>
    <div id={id} hidden={!showHelp}><p>{description}</p>{help}</div>
  </section>;
}
/** Only optional explanations belong here; never wrap errors or operational warnings. */
export function AdminHelp({ children }: { children: ReactNode }) {
  const { showHelp } = useAdminHelp();
  return showHelp ? <p className="admin-context-help">{children}</p> : null;
}
