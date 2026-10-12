import type { EditorDocument } from './model';
import { isEditorDirty } from './model';
export interface EditorHistory { past: EditorDocument[]; present: EditorDocument; future: EditorDocument[] }
export const createHistory = (present: EditorDocument): EditorHistory => ({ past: [], present, future: [] });
/** Session only, bounded snapshots; model updates are immutable and share unchanged branches. */
export function recordHistory(history: EditorHistory, next: EditorDocument): EditorHistory {
  return isEditorDirty(next, history.present) ? { past: [...history.past, history.present].slice(-40), present: next, future: [] } : history;
}
export function undoHistory(history: EditorHistory): EditorHistory {
  const previous = history.past[history.past.length - 1];
  return previous ? { past: history.past.slice(0,-1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redoHistory(history: EditorHistory): EditorHistory {
  return history.future.length ? { past: [...history.past, history.present].slice(-40), present: history.future[0], future: history.future.slice(1) } : history;
}
