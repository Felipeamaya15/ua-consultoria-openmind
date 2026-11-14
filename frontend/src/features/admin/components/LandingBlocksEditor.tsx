import { useEffect, useState, type ReactNode } from 'react';
import { SYSTEM_SECTIONS, systemSectionVisible, type SystemSectionId } from '../../landing/types/homeSections';
import { Link } from 'react-router-dom';
import type { BloqueLanding, TipoBloqueLanding } from '../../landing/types/landing.types';
import { AdminCard, Button, Input, Textarea, Toggle, Modal } from './ui';
import { ImageUpload } from './ui/ImageUpload';
import { defaultStoryBlocks, editableLandingBlocks, restoreStoryBlocks } from '../../landing/types/defaultStoryBlocks';
import { FlexibleSectionEditor } from './FlexibleSectionEditor';
import { SECTION_PRESETS, createFlexibleSection, type SectionPreset } from '../../landing/types/sectionElements';
import './landing-blocks.css';

// Los identificadores vienen de SYSTEM_SECTIONS: no confundir otros tipos con Minimal.
const TEMPLATE_NAMES: Record<string, string> = {
  catalog: 'Catálogo',
  editorial: 'Editorial',
  minimal: 'Minimal',
  visual: 'Visual',
};

function templateAvailability(templates: readonly string[]): string {
  const names = [...new Set(templates)].map(id => TEMPLATE_NAMES[id] ?? id);
  if (names.length === 4) return 'Disponible en todas las plantillas';
  return names.length ? `Disponible en: ${names.join(', ')}` : 'Sin plantilla asignada';
}

export const BLOCK_TYPES: { tipo: TipoBloqueLanding; nombre: string; descripcion: string; icono: string }[] = [
  { tipo: 'historia', nombre: 'Nuestra historia', descripcion: 'Cuenta el origen, valores y propósito de tu negocio.', icono: 'historia' },
  { tipo: 'imagen_texto', nombre: 'Imagen y texto', descripcion: 'Combina una fotografía de impacto con un texto explicativo.', icono: 'imagen_texto' },
  { tipo: 'texto', nombre: 'Texto libre', descripcion: 'Título y párrafos para comunicados, avisos o información relevante.', icono: 'texto' },
  { tipo: 'galeria', nombre: 'Galería de imágenes', descripcion: 'Muestra hasta ocho fotografías con sus títulos y descripciones.', icono: 'galeria' },
  { tipo: 'cita', nombre: 'Cita destacada', descripcion: 'Destaca un testimonio de clientes o una frase de tu marca.', icono: 'cita' },
];

const INTERACTIVE_PRESETS: { preset: SectionPreset; nombre: string; descripcion: string }[] = [
  { preset: 'servicios', nombre: 'Sección de servicios', descripcion: 'Presenta servicios profesionales con características y formulario de consulta.' },
  { preset: 'talleres', nombre: 'Sección de talleres', descripcion: 'Actividad grupal o taller con fechas, horarios y formulario de inscripción.' },
  { preset: 'multimedia', nombre: 'Sección multimedia', descripcion: 'Videos de YouTube, publicaciones de redes sociales e imágenes.' },
  { preset: 'informativa', nombre: 'Sección informativa', descripcion: 'Preguntas frecuentes, pasos y contenido estructurado.' },
  { preset: 'personalizada', nombre: 'Sección modular en blanco', descripcion: 'Combina libremente textos, imágenes, videos y botones según tu necesidad.' },
];

function SectionThumbnail({ type }: { type: TipoBloqueLanding }) {
  const image = type === 'historia' || type === 'imagen_texto';
  const gallery = type === 'galeria';
  const custom = type === 'personalizada';

  return (
    <svg className="lb-thumbnail" viewBox="0 0 220 104" fill="none" aria-hidden="true">
      <rect width="220" height="104" rx="8" fill="#f1f5f9" />
      {gallery ? (
        [20, 82, 144].map(x => (
          <g key={x}>
            <rect x={x} y="20" width="56" height="48" rx="4" fill="#cbd5e1" />
            <path d={`M${x + 4} 61l15-18 9 10 9-14 15 22`} fill="#94a3b8" />
            <rect x={x} y="76" width="42" height="4" rx="2" fill="#94a3b8" />
          </g>
        ))
      ) : custom ? (
        <>
          <rect x="24" y="22" width="172" height="10" rx="3" fill="#6366f1" />
          <rect x="24" y="40" width="110" height="6" rx="2" fill="#cbd5e1" />
          <rect x="24" y="52" width="150" height="6" rx="2" fill="#cbd5e1" />
          <rect x="24" y="72" width="70" height="16" rx="4" fill="#4f46e5" />
          <rect x="102" y="72" width="50" height="16" rx="4" fill="#e2e8f0" />
        </>
      ) : (
        <>
          <rect x={image ? 112 : 28} y="28" width={image ? 81 : 164} height="7" rx="3" fill="#475569" />
          <rect x={image ? 112 : 28} y="45" width={image ? 65 : 135} height="4" rx="2" fill="#94a3b8" />
          <rect x={image ? 112 : 28} y="56" width={image ? 81 : 164} height="4" rx="2" fill="#94a3b8" />
          <rect x={image ? 112 : 28} y="67" width={image ? 72 : 150} height="4" rx="2" fill="#cbd5e1" />
          {image && (
            <>
              <rect x="20" y="18" width="76" height="68" rx="5" fill="#cbd5e1" />
              <path d="m25 76 24-31 15 15 12-20 16 36" fill="#94a3b8" />
              <circle cx="78" cy="33" r="7" fill="#f8fafc" />
            </>
          )}
          {type === 'cita' && <path d="M16 24h9l-4 10h5v12H14V33z" fill="#475569" />}
        </>
      )}
    </svg>
  );
}

type UnifiedLayout = {
  order: string[];
  flags: Record<string, boolean>;
  onMove: (order: string[]) => void;
  onToggle: (flag: string, visible: boolean) => void;
  renderConfig: (id: SystemSectionId) => ReactNode;
};

export function LandingBlocksEditor({
  value,
  onChange,
  layout,
}: {
  value?: BloqueLanding[];
  onChange: (blocks: BloqueLanding[]) => void;
  layout?: UnifiedLayout;
}) {
  const blocks = value ?? [];
  const rows = layout ? layout.order : blocks.map(block => block.id);
  const remainingDefaults = defaultStoryBlocks().filter(block => !blocks.some(current => current.id === block.id));
  const expandedKey = 'openmind:landing:expanded-section';

  const [expanded, setExpanded] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(expandedKey) || undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    try {
      if (expanded) localStorage.setItem(expandedKey, expanded);
      else localStorage.removeItem(expandedKey);
    } catch {
      // El editor sigue funcionando sin almacenamiento.
    }
  }, [expanded]);
  const [remove, setRemove] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [flexiblePicker, setFlexiblePicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<'content' | 'interactive'>('content');

  const visibleCount = blocks.filter(block => block.visible).length;
  const hiddenCount = blocks.length - visibleCount;
  const capacityPercent = Math.min(100, Math.round((blocks.length / 20) * 100));

  const update = (id: string, patch: Partial<BloqueLanding>) =>
    onChange(blocks.map(block => (block.id === id ? { ...block, ...patch } : block)));

  const move = (index: number, delta: number) => {
    if (index + delta < 0 || index + delta >= rows.length) return;
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    if (layout) layout.onMove(next);
    else onChange(next.map(id => blocks.find(block => block.id === id)!));
  };

  const addStory = (type: TipoBloqueLanding, title: string) => {
    const block: BloqueLanding = {
      id: crypto.randomUUID(),
      tipo: type,
      visible: true,
      titulo: title,
      subtitulo: '',
      texto: '',
      imagenes: [],
    };
    onChange([...editableLandingBlocks(value), block]);
    setExpanded(block.id);
    setPicker(false);
  };

  const addFlexible = (preset: SectionPreset) => {
    const block = createFlexibleSection(preset);
    onChange([...editableLandingBlocks(value), block]);
    setExpanded(block.id);
    setPicker(false);
    setFlexiblePicker(false);
  };

  return (
    <section id="secciones-tienda" aria-label="Secciones de mi tienda" className="landing-blocks scroll-mt-24">
      <AdminCard>
        {/* Encabezado descriptivo con botón de agregar */}
        <div className="lb-heading">
          <div>
            <h2>Secciones de mi tienda</h2>
            <p>
              Organiza la estructura visual de tu tienda. Puedes mover secciones arriba o abajo, ocultar
              temporalmente las que no desees mostrar y editar sus contenidos en cualquier momento.
            </p>
          </div>
          <button
            type="button"
            className="lb-add-btn"
            aria-label="Agregar sección"
            disabled={editableLandingBlocks(value).length >= 20}
            onClick={() => {
              setPickerCategory('content');
              setPicker(true);
            }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
            </svg>
            <span>Agregar sección</span>
          </button>
        </div>

        {/* Barra de capacidad y visibilidad */}
        <div className="lb-toolbar">
          <div className="lb-toolbar-stats">
            <span className="lb-capacity-badge">
              <span>Capacidad: {blocks.length} de 20 secciones propias</span>
              <span className="lb-capacity-meter" aria-hidden="true">
                <span className="lb-capacity-meter-fill" style={{ width: `${capacityPercent}%` }} />
              </span>
            </span>
            <span className="lb-count-pill is-visible">
              <span className="lb-status-dot" />
              <span>{visibleCount} visibles</span>
            </span>
            {hiddenCount > 0 && (
              <span className="lb-count-pill">
                <span>{hiddenCount} ocultas</span>
              </span>
            )}
          </div>
          <Link to="/emprendedor/diseno/editor">
            <span>Personalizar diseño visual</span>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        {/* Estado inicial sin secciones */}
        {value === undefined && (
          <div className="lb-originals">
            <div className="lb-originals-visual">
              <SectionThumbnail type="historia" />
            </div>
            <div>
              <strong>Aún no tienes secciones personalizadas creadas</strong>
              <p>
                Los apartados comerciales conservan tu selección actual. Si lo deseas, puedes comenzar con dos
                historias de ejemplo y editarlas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange(defaultStoryBlocks());
                setExpanded(defaultStoryBlocks()[0].id);
              }}
            >
              Usar historias de ejemplo
            </button>
          </div>
        )}

        {/* Lista vacía */}
        {value !== undefined && !blocks.length && (
          <div className="lb-empty">
            <SectionThumbnail type="texto" />
            <strong>Tu tienda aún no tiene bloques de contenido</strong>
            <p>Agrega historias, textos con fotos, galerías de productos o secciones de servicios y talleres.</p>
            <button
              type="button"
              className="lb-add-btn"
              onClick={() => {
                setPickerCategory('content');
                setPicker(true);
              }}
            >
              Explorar secciones disponibles
            </button>
          </div>
        )}

        {/* Listado ordenable de secciones */}
        <ol className="lb-list">
          {rows.map((id, index) => {
            const system = SYSTEM_SECTIONS.find(section => section.id === id);

            // Fila de sección del sistema (Catálogo / Productos destacados / Categorías)
            if (system && layout) {
              const visible = systemSectionVisible(system.id, layout.flags);
              return (
                <li key={id} data-system-section={id}>
                  <div className="lb-row">
                    <span className="lb-position" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      className="lb-expand"
                      aria-label={`Editar ${system.name}`}
                      aria-expanded={expanded === id}
                      aria-controls={'lb-fields-' + id}
                      onClick={() => setExpanded(expanded === id ? undefined : id)}
                    >
                      <span className="lb-row-thumbnail">
                        <SectionThumbnail type="personalizada" />
                      </span>
                      <span className="lb-expand-meta">
                        <strong>{system.name}</strong>
                        <small>Apartado del catálogo · {templateAvailability(system.templates)}</small>
                      </span>
                      <span className="lb-edit-label">
                        <span>{expanded === id ? 'Cerrar' : 'Editar'}</span>
                        <svg
                          className={`lb-edit-chevron ${expanded === id ? 'is-open' : ''}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </button>
                    <div className="lb-actions">
                      <span className={'lb-status ' + (!visible ? 'is-hidden' : '')}>
                        <span className="lb-status-dot" />
                        <span>{visible ? 'Visible' : 'Oculta'}</span>
                      </span>
                      <Toggle
                        checked={visible}
                        ariaLabel={`Mostrar ${system.name}`}
                        onChange={enabled => layout.onToggle(system.flag, enabled)}
                      />
                      <div className="lb-move">
                        <button
                          type="button"
                          aria-label={`Subir ${system.name}`}
                          title="Subir posición"
                          disabled={!index}
                          onClick={() => move(index, -1)}
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Bajar ${system.name}`}
                          title="Bajar posición"
                          disabled={index === rows.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  {expanded === id && (
                    <div className="lb-fields" id={'lb-fields-' + id}>
                      {layout.renderConfig(system.id)}
                    </div>
                  )}
                </li>
              );
            }

            // Fila de sección propia configurable
            const block = blocks.find(b => b.id === id);
            if (!block) return null;

            const blockTypeInfo = BLOCK_TYPES.find(t => t.tipo === block.tipo);
            const isActivity = !!block.actividad;
            const typeLabel = isActivity
              ? block.actividad?.tipo === 'taller'
                ? 'Taller'
                : 'Servicio'
              : blockTypeInfo?.nombre || 'Sección personalizada';

            return (
              <li key={block.id} data-block-id={block.id}>
                <div className="lb-row">
                  <span className="lb-position" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    className="lb-expand"
                    aria-label={`Editar sección ${index + 1}`}
                    aria-expanded={expanded === block.id}
                    aria-controls={'lb-fields-' + block.id}
                    onClick={() => setExpanded(expanded === block.id ? undefined : block.id)}
                  >
                    <span className="lb-row-thumbnail">
                      {block.imagenes[0]?.src ? (
                        <img src={block.imagenes[0].src} alt="" />
                      ) : (
                        <SectionThumbnail type={block.tipo} />
                      )}
                    </span>
                    <span className="lb-expand-meta">
                      <strong>{block.nombre_interno || block.titulo || 'Sin título'}</strong>
                      <small>
                        {typeLabel} · Sección propia para tu tienda
                      </small>
                    </span>
                    <span className="lb-edit-label">
                      <span>{expanded === block.id ? 'Cerrar' : 'Editar'}</span>
                      <svg
                        className={`lb-edit-chevron ${expanded === block.id ? 'is-open' : ''}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </button>
                  <div className="lb-actions">
                    <span className={'lb-status ' + (!block.visible ? 'is-hidden' : '')}>
                      <span className="lb-status-dot" />
                      <span>{block.visible ? 'Visible' : 'Oculta'}</span>
                    </span>
                    <Toggle
                      checked={block.visible}
                      ariaLabel={`Mostrar sección ${index + 1}`}
                      onChange={visible => update(block.id, { visible })}
                    />
                    <div className="lb-move">
                      <button
                        type="button"
                        title="Mover arriba"
                        aria-label={`Subir sección ${index + 1}`}
                        disabled={!index}
                        onClick={() => move(index, -1)}
                      >
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Mover abajo"
                        aria-label={`Bajar sección ${index + 1}`}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="lb-danger"
                      aria-label={`Eliminar sección ${index + 1}`}
                      title="Eliminar sección"
                      onClick={() => setRemove(block.id)}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                {expanded === block.id && (
                  <div className="lb-fields" id={'lb-fields-' + block.id}>
                    {block.tipo === 'personalizada' ? (
                      <FlexibleSectionEditor section={block} onChange={next => update(block.id, next)} />
                    ) : (
                      <>
                        <div className="lb-text-fields">
                          <Input
                            label="Título de la sección"
                            maxLength={255}
                            value={block.titulo}
                            onChange={e => update(block.id, { titulo: e.target.value })}
                          />
                          <Input
                            label="Subtítulo de la sección"
                            maxLength={500}
                            value={block.subtitulo}
                            onChange={e => update(block.id, { subtitulo: e.target.value })}
                          />
                          <Textarea
                            label={block.tipo === 'cita' ? 'Cita o testimonio' : 'Párrafos de la sección'}
                            rows={5}
                            maxLength={10000}
                            value={block.texto}
                            onChange={e => update(block.id, { texto: e.target.value })}
                          />
                        </div>
                        <div className="lb-media-fields">
                          {['historia', 'imagen_texto', 'galeria'].includes(block.tipo) && (
                            <>
                              <p className="lb-help">Formatos: JPG, PNG, WebP · Hasta 2 MB por imagen.</p>
                              {block.imagenes.map((image, i) => (
                                <div className="lb-image" key={image.id}>
                                  <ImageUpload
                                    label={`Cambiar imagen ${i + 1}`}
                                    value={image.src}
                                    maxMB={2}
                                    allowSVG={false}
                                    onChange={src =>
                                      update(block.id, {
                                        imagenes: src
                                          ? block.imagenes.map(item => (item.id === image.id ? { ...item, src } : item))
                                          : block.imagenes.filter(item => item.id !== image.id),
                                      })
                                    }
                                  />
                                  <Input
                                    label={`Descripción de imagen ${i + 1}`}
                                    value={image.alt}
                                    maxLength={250}
                                    onChange={e =>
                                      update(block.id, {
                                        imagenes: block.imagenes.map(item =>
                                          item.id === image.id ? { ...item, alt: e.target.value } : item
                                        ),
                                      })
                                    }
                                  />
                                  {block.tipo === 'galeria' && (
                                    <div className="lb-actions">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={!i}
                                        onClick={() => {
                                          const images = [...block.imagenes];
                                          [images[i - 1], images[i]] = [images[i], images[i - 1]];
                                          update(block.id, { imagenes: images });
                                        }}
                                      >
                                        Mover antes
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={i === block.imagenes.length - 1}
                                        onClick={() => {
                                          const images = [...block.imagenes];
                                          [images[i + 1], images[i]] = [images[i], images[i + 1]];
                                          update(block.id, { imagenes: images });
                                        }}
                                      >
                                        Mover después
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {block.imagenes.length < (block.tipo === 'galeria' ? 8 : 1) && (
                                <ImageUpload
                                  label="Agregar imagen a la sección"
                                  value=""
                                  maxMB={2}
                                  allowSVG={false}
                                  onChange={src => {
                                    if (src) {
                                      update(block.id, {
                                        imagenes: [...block.imagenes, { id: crypto.randomUUID(), src, alt: '' }],
                                      });
                                    }
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Barra inferior y recuperación */}
        <div className="lb-bottom">
          <span>
            {blocks.length} de 20 secciones propias creadas · Los apartados comerciales del catálogo no consumen este límite
          </span>
          {value !== undefined && remainingDefaults.length > 0 && (
            <button
              type="button"
              disabled={blocks.length + remainingDefaults.length > 20}
              onClick={() => onChange(restoreStoryBlocks(value))}
            >
              Recuperar secciones predeterminadas
            </button>
          )}
        </div>

        {/* Vista previa del orden de navegación */}
        {layout && (
          <details className="lb-order-preview">
            <summary>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 10z" clipRule="evenodd" />
              </svg>
              <span>Ver mapa y orden configurado de la tienda</span>
            </summary>
            <div className="lb-order-flow">
              <span className="lb-order-pill is-fixed">Portada fija</span>
              <span className="lb-order-arrow" aria-hidden="true">→</span>
              <span className="lb-order-pill is-fixed">Beneficios</span>
              {rows
                .filter(id => {
                  const system = SYSTEM_SECTIONS.find(section => section.id === id);
                  return system
                    ? systemSectionVisible(system.id, layout.flags)
                    : blocks.find(b => b.id === id)?.visible;
                })
                .map(id => {
                  const name =
                    SYSTEM_SECTIONS.find(section => section.id === id)?.name ||
                    blocks.find(b => b.id === id)?.nombre_interno ||
                    blocks.find(b => b.id === id)?.titulo ||
                    'Sección sin título';
                  return (
                    <span key={id} className="inline-flex items-center gap-1">
                      <span className="lb-order-arrow" aria-hidden="true">→</span>
                      <span className="lb-order-pill">{name}</span>
                    </span>
                  );
                })}
            </div>
            <p>
              Este mapa muestra el orden en que se presentarán las secciones en tu tienda. Los apartados ocultos se omiten automáticamente. Guarda los cambios y pulsa «Ver mi tienda» para visualizar el resultado final.
            </p>
          </details>
        )}
      </AdminCard>

      {/* Modal unificado para Agregar Sección */}
      <Modal
        open={picker}
        onClose={() => setPicker(false)}
        title="Agregar una sección a tu tienda"
        size="xl"
      >
        <p className="lb-library-description">
          Elige el tipo de contenido que deseas incorporar. Todo el contenido se adapta automáticamente al diseño de tu tienda.
        </p>

        {/* Pestañas de categoría amigables */}
        <div className="lb-modal-tabs" role="tablist" aria-label="Categorías de secciones">
          <button
            type="button"
            role="tab"
            aria-selected={pickerCategory === 'content'}
            className={`lb-modal-tab ${pickerCategory === 'content' ? 'is-active' : ''}`}
            onClick={() => setPickerCategory('content')}
          >
            Historias y contenido de marca
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pickerCategory === 'interactive'}
            className={`lb-modal-tab ${pickerCategory === 'interactive' ? 'is-active' : ''}`}
            onClick={() => setPickerCategory('interactive')}
          >
            Servicios, talleres e interacción
          </button>
        </div>

        {pickerCategory === 'content' ? (
          <div className="lb-picker" aria-label="Tipos de sección">
            {BLOCK_TYPES.map(type => (
              <button
                key={type.tipo}
                type="button"
                disabled={editableLandingBlocks(value).length >= 20}
                onClick={() => addStory(type.tipo, type.nombre)}
              >
                <SectionThumbnail type={type.tipo} />
                <strong>{type.nombre}</strong>
                <small>{type.descripcion}</small>
                <span className="lb-add-type">
                  <span>+ Agregar esta sección</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="lb-picker" aria-label="Plantillas interactivas">
            {INTERACTIVE_PRESETS.map(item => (
              <button
                key={item.preset}
                type="button"
                disabled={blocks.length >= 20}
                onClick={() => addFlexible(item.preset)}
              >
                <SectionThumbnail type="personalizada" />
                <strong>{item.nombre}</strong>
                <small>{item.descripcion}</small>
                <span className="lb-add-type">
                  <span>+ Crear sección</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="lb-library-footer">
          <span>
            Los apartados comerciales de catálogo (como Productos destacados y Categorías) se administran en la lista principal.
          </span>
          <Button type="button" variant="ghost" onClick={() => setPicker(false)}>
            Cerrar
          </Button>
        </div>
      </Modal>

      {/* Modal secundario para selección directa de flexible presets (por retrocompatibilidad) */}
      <Modal
        open={flexiblePicker}
        onClose={() => setFlexiblePicker(false)}
        title="Crear sección configurable"
        size="xl"
      >
        <p className="lb-library-description">
          Comienza con una plantilla de sección o crea tu propia combinación de bloques.
        </p>
        <div className="lb-picker" aria-label="Plantillas configurables">
          {Object.entries(SECTION_PRESETS).map(([preset, name]) => (
            <button
              key={preset}
              type="button"
              disabled={blocks.length >= 20}
              onClick={() => addFlexible(preset as SectionPreset)}
            >
              <SectionThumbnail type="personalizada" />
              <strong>{name}</strong>
              <small>Agrega y ordena bloques de contenido, multimedia y formularios.</small>
              <span className="lb-add-type">Crear sección →</span>
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" onClick={() => setFlexiblePicker(false)}>
          Cancelar
        </Button>
      </Modal>

      {/* Modal de confirmación para eliminar sección */}
      <Modal open={!!remove} onClose={() => setRemove(undefined)} title="Eliminar sección" size="sm">
        <p className="text-sm text-slate-600">
          ¿Estás seguro de que deseas eliminar esta sección de tu tienda? El cambio se hará efectivo al guardar la página principal.
        </p>
        <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={() => setRemove(undefined)}>
            Conservar sección
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              onChange(blocks.filter(block => block.id !== remove));
              setRemove(undefined);
            }}
          >
            Eliminar definitivamente
          </Button>
        </div>
      </Modal>
    </section>
  );
}
