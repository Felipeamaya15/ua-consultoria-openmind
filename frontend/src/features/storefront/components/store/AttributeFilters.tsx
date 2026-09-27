import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import type {
  AttributeGroup,
  AttributeSelection,
} from '../..//hooks/useAttributeFilters';

interface AttributeFiltersProps {
  groups: AttributeGroup[];
  selected: AttributeSelection;
  onToggle: (name: string, value: string) => void;
}

const STYLES = {
  // Plantilla 4
  catalog: {
    wrapper: 'border-t border-black/10 mt-5 pt-5',
    title: 'mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/45',
    label: 'flex items-center gap-2.5 py-1.5 text-[12px] cursor-pointer',
    input: 'accent-[#1683ff]',
  },
  // Plantilla 3
  visual: {
    wrapper: 'min-w-0',
    title: 'mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#111111]',
    label: 'flex items-center gap-2.5 py-1 text-[13px] text-[#111111] cursor-pointer',
    input: 'accent-black',
  },
  // Plantillas 1 y 2
  default: {
    wrapper: 'border-t border-[var(--border)] mt-4 pt-4',
    title: 'text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3',
    label: 'flex items-center gap-2 text-sm py-1 cursor-pointer',
    input: 'rounded border-[var(--border)]',
  },
};

export function AttributeFilters({ groups, selected, onToggle }: AttributeFiltersProps) {
  const { isCatalog, isVisual } = useStorefrontTemplate();
  const styles = isCatalog ? STYLES.catalog : isVisual ? STYLES.visual : STYLES.default;

  return (
    <>
      {groups.map((group) => (
        <div key={group.name} role="group" aria-label={group.name} className={styles.wrapper}>
          <p className={styles.title}>{group.name}</p>

          {group.options.map((option) => (
            <label key={option} className={styles.label}>
              <input
                type="checkbox"
                checked={selected[group.name]?.includes(option) ?? false}
                onChange={() => onToggle(group.name, option)}
                className={styles.input}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ))}
    </>
  );
}

interface AppliedAttributeFiltersProps {
  selected: AttributeSelection;
  onRemove: (name: string, value: string) => void;
  onClearAll: () => void;
}

const APPLIED_STYLES = {
  catalog: {
    chip: 'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/20',
    clear: 'text-[11px] font-semibold text-[#1683ff] hover:opacity-70',
  },
  visual: {
    chip: 'inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-3 py-1.5 text-[11px] font-medium text-[#111111] transition-colors hover:border-black',
    clear: 'text-[11px] font-semibold text-[#111111] underline underline-offset-4 hover:opacity-60',
  },
  default: {
    chip: 'inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]',
    clear: 'text-xs font-semibold text-[var(--primary)] hover:underline',
  },
};


export function AppliedAttributeFilters({
  selected,
  onRemove,
  onClearAll,
}: AppliedAttributeFiltersProps) {
  const { isCatalog, isVisual } = useStorefrontTemplate();
  const styles = isCatalog
    ? APPLIED_STYLES.catalog
    : isVisual
      ? APPLIED_STYLES.visual
      : APPLIED_STYLES.default;

  const chips = Object.entries(selected).flatMap(([name, values]) =>
    values.map((value) => ({ name, value })),
  );
  if (chips.length === 0) return null;

  return (
    <div role="group" aria-label="Filtros aplicados" className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map(({ name, value }) => (
        <button
          type="button"
          key={`${name}:${value}`}
          onClick={() => onRemove(name, value)}
          aria-label={`Quitar filtro ${name}: ${value}`}
          className={styles.chip}
        >
          <span>
            {name}: {value}
          </span>
          <span aria-hidden="true">×</span>
        </button>
      ))}

      <button type="button" onClick={onClearAll} className={styles.clear}>
        Quitar todos
      </button>
    </div>
  );
}