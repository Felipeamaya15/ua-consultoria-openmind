import { useState } from 'react';
import { Button, Input } from '../../admin/components/ui';
import type { MarketingDraft } from '../domain/drafts';

export function DraftPanel({ drafts, onOpen, onRename, onDuplicate, onDelete }: {
  drafts: MarketingDraft[]; onOpen: (draft: MarketingDraft) => void; onRename: (draft: MarketingDraft, name: string) => boolean;
  onDuplicate: (draft: MarketingDraft) => void; onDelete: (draft: MarketingDraft) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  return <section className="marketing-drafts" aria-label="Mis borradores">
    <h3>Mis borradores</h3>
    <p className="marketing-hint">Solo en este navegador, para tu usuario y esta tienda. No se sincronizan entre dispositivos. Hasta 30 borradores.</p>
    {!drafts.length && <p role="status">Aún no tienes borradores guardados.</p>}
    <ul>{drafts.map(draft => <li key={draft.id}>
      <strong>{draft.name}</strong><small>Modificado: {new Date(draft.updatedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</small>
      <div className="marketing-editor-actions">
        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(draft)}>Abrir {draft.name}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(draft.id); setName(draft.name); setDeleting(null); }}>Renombrar {draft.name}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDuplicate(draft)}>Duplicar {draft.name}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setDeleting(draft.id); setEditing(null); }}>Eliminar {draft.name}</Button>
      </div>
      {editing === draft.id && <form onSubmit={event => { event.preventDefault(); if (onRename(draft, name)) setEditing(null); }}>
        <Input autoFocus label="Nuevo nombre del borrador" value={name} required maxLength={80} onChange={event => setName(event.target.value)} />
        <div className="marketing-editor-actions"><Button type="submit" size="sm">Guardar nombre</Button><Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
      </form>}
      {deleting === draft.id && <div role="group" aria-label={`Confirmar eliminación de ${draft.name}`} className="marketing-reset-confirm">
        <p>¿Eliminar «{draft.name}» de este navegador? Esta acción no se puede deshacer. Si está abierto, podrás conservar tu edición como un borrador nuevo.</p>
        <Button type="button" size="sm" onClick={() => { onDelete(draft); setDeleting(null); }}>Confirmar eliminación</Button><Button type="button" size="sm" variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
      </div>}
    </li>)}</ul>
  </section>;
}
