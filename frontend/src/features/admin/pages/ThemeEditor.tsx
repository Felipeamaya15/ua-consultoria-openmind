import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useSearchParams,
} from 'react-router-dom';

import { useAdmin } from '../context/AdminContext';
import { templatePaths } from '../config/navigation';
import type { TemplateId } from '../data/mockAdminData';
import type {
  ThemeImageSetting,
  ThemeTemplateCustomization,
} from '../types';
import {
  Button,
  Modal,
} from '../components/ui';

import '../admin.css';

const PALETTES = [
  {
    name: 'Océano',
    primary: '#2563eb',
    secondary: '#eff6ff',
    accent: '#0ea5e9',
  },
  {
    name: 'Bosque',
    primary: '#15803d',
    secondary: '#f0fdf4',
    accent: '#84cc16',
  },
  {
    name: 'Ciruela',
    primary: '#7e22ce',
    secondary: '#faf5ff',
    accent: '#d946ef',
  },
  {
    name: 'Grafito',
    primary: '#1f2937',
    secondary: '#f3f4f6',
    accent: '#f97316',
  },
] as const;

type SelectedImage = {
  key: string;
  label: string;
  top: number;
  left: number;
};

function clampPopover(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(min, Math.min(value, max));
}

export default function ThemeEditor() {
  const {
    config,
    setConfig,
  } = useAdmin();

  const [params] = useSearchParams();

  const requested = params.get('plantilla');

  const template: TemplateId =
    requested &&
    Object.prototype.hasOwnProperty.call(
      templatePaths,
      requested,
    )
      ? (requested as TemplateId)
      : config.template;

  const iframeRef =
    useRef<HTMLIFrameElement>(null);

  const [paletteOpen, setPaletteOpen] =
    useState(false);

  const [selectedImage, setSelectedImage] =
    useState<SelectedImage | null>(null);

  const [saved, setSaved] =
    useState(false);

  const [confirmOpen, setConfirmOpen] =
    useState(false);


  function loadThemeFor(
    targetTemplate: TemplateId,
  ): ThemeTemplateCustomization {
    return (
      config.themeEditor?.[targetTemplate] ?? {
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        accentColor: config.accentColor,
        paletteName: 'Original',
        images: {},
      }
    );
  }

  // Borrador local: solo vive en esta pantalla hasta publicar
  const [theme, setTheme] =
    useState<ThemeTemplateCustomization>(() =>
      loadThemeFor(template),
    );

  // Si cambia la plantilla que se está editando, reinicia
  // el borrador con lo último publicado de esa plantilla
  useEffect(() => {
    setTheme(loadThemeFor(template));
  }, [template]);

  function updateTheme(
    patch: Partial<ThemeTemplateCustomization>,
  ) {
    const nextTheme = {
      ...theme,
      ...patch,
      images: patch.images ?? theme.images,
    };

    setTheme(nextTheme);

    applyThemeToPreview(nextTheme);
  }

  function applyThemeToPreview(
    currentTheme = theme,
  ) {
    const doc =
      iframeRef.current?.contentDocument;

    if (!doc) return;

    const root = doc.documentElement;

    root.style.setProperty(
      '--primary',
      currentTheme.primaryColor,
    );

    root.style.setProperty(
      '--secondary',
      currentTheme.secondaryColor,
    );

    root.style.setProperty(
      '--accent',
      currentTheme.accentColor,
    );

    root.style.setProperty(
      '--ring',
      currentTheme.primaryColor,
    );

    const images = Array.from(
      doc.querySelectorAll<HTMLImageElement>('img'),
    );

    images.forEach((img, index) => {
      const key = `image-${index}`;
      const setting =
        currentTheme.images[key];

      img.dataset.themeEditorKey = key;

      if (!setting) return;

      if (
        setting.src &&
        img.src !== setting.src
      ) {
        img.src = setting.src;
      }

      img.style.objectPosition =
        `${setting.x}% ${setting.y}%`;

      img.style.transform =
        `scale(${setting.scale / 100})`;

      img.style.transformOrigin = 'center';

      img.style.borderRadius =
        `${setting.radius}px`;
    });
  }

  function attachEditorEvents() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    if (!iframe || !doc) return;

    applyThemeToPreview();

    let editorStyle =
      doc.getElementById(
        'ua-theme-editor-style',
      ) as HTMLStyleElement | null;

    if (!editorStyle) {
      editorStyle =
        doc.createElement('style');

      editorStyle.id =
        'ua-theme-editor-style';

      editorStyle.textContent = `
        img[data-theme-editor-key] {
          cursor: pointer !important;
          transition:
            outline-color .15s ease,
            box-shadow .15s ease,
            transform .2s ease,
            border-radius .2s ease !important;
        }

        img[data-theme-editor-key]:hover {
          outline: 3px solid #2563eb !important;
          outline-offset: -3px !important;
          box-shadow:
            inset 0 0 0 9999px
            rgba(37, 99, 235, .04) !important;
        }

        img[data-theme-editor-selected="true"] {
          outline: 4px solid #2563eb !important;
          outline-offset: -4px !important;
        }
      `;

      doc.head.appendChild(editorStyle);
    }

    const images = Array.from(
      doc.querySelectorAll<HTMLImageElement>('img'),
    );

    images.forEach((img, index) => {
      const key = `image-${index}`;

      img.dataset.themeEditorKey = key;

      img.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        images.forEach(
          (current) =>
            delete current.dataset
              .themeEditorSelected,
        );

        img.dataset.themeEditorSelected =
          'true';

        const imageRect =
          img.getBoundingClientRect();

        const iframeRect =
          iframe.getBoundingClientRect();

        const width = 310;

        const preferredLeft =
          iframeRect.left +
          imageRect.right +
          12;

        const fallbackLeft =
          iframeRect.left +
          imageRect.left -
          width -
          12;

        const left =
          preferredLeft + width <
          window.innerWidth
            ? preferredLeft
            : fallbackLeft;

        setSelectedImage({
          key,
          label:
            img.alt?.trim() ||
            `Imagen ${index + 1}`,
          top: clampPopover(
            iframeRect.top +
              imageRect.top,
            76,
            window.innerHeight - 460,
          ),
          left: clampPopover(
            left,
            12,
            window.innerWidth -
              width -
              12,
          ),
        });
      };
    });
  }

  function currentImageSetting():
    ThemeImageSetting {
    if (!selectedImage) {
      return {
        src: '',
        scale: 100,
        x: 50,
        y: 50,
        radius: 0,
      };
    }

    const existing =
      theme.images[selectedImage.key];

    if (existing) return existing;

    const doc =
      iframeRef.current?.contentDocument;

    const img =
      doc?.querySelector<HTMLImageElement>(
        `img[data-theme-editor-key="${selectedImage.key}"]`,
      );

    return {
      src: img?.src ?? '',
      scale: 100,
      x: 50,
      y: 50,
      radius: 0,
    };
  }

  function updateSelectedImage(
    patch: Partial<ThemeImageSetting>,
  ) {
    if (!selectedImage) return;

    const current =
      currentImageSetting();

    const next: ThemeImageSetting = {
      ...current,
      ...patch,
    };

    updateTheme({
      images: {
        ...theme.images,
        [selectedImage.key]: next,
      },
    });
  }

  function resetSelectedImage() {
    if (!selectedImage) return;

    const nextImages = {
      ...theme.images,
    };

    delete nextImages[selectedImage.key];

    updateTheme({
      images: nextImages,
    });

    const doc =
      iframeRef.current?.contentDocument;

    const img =
      doc?.querySelector<HTMLImageElement>(
        `img[data-theme-editor-key="${selectedImage.key}"]`,
      );

    if (img) {
      img.style.objectPosition = '';
      img.style.transform = '';
      img.style.transformOrigin = '';
      img.style.borderRadius = '';
    }
  }

  function saveAndPublish() {
    setConfig({
      ...config,
      template,
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      accentColor: theme.accentColor,
      themeEditor: {
        ...config.themeEditor,
        [template]: theme,
      },
    });

    setSaved(true);

    setTimeout(
      () => setSaved(false),
      1800,
    );
  }

  useEffect(() => {
    function handleResize() {
      setSelectedImage(null);
    }

    window.addEventListener(
      'resize',
      handleResize,
    );

    return () =>
      window.removeEventListener(
        'resize',
        handleResize,
      );
  }, []);

  const imageSetting =
    currentImageSetting();

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      <header className="fixed inset-x-0 top-0 z-50 h-16 bg-white border-b border-[var(--border)] flex items-center justify-between px-4 md:px-6 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/emprendedor/diseno"
            className="text-sm font-medium text-[var(--primary)] whitespace-nowrap"
          >
            ← Volver a Diseño
          </Link>

          <div className="hidden sm:block h-6 w-px bg-[var(--border)]" />

          <div>
            <p className="text-sm font-semibold">
              Editor de tienda
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Toca una imagen para editarla
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPaletteOpen(
                (value) => !value,
              )
            }
          >
            🎨 Colores
          </Button>

          <Link
            to={templatePaths[template]}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="sm"
            >
              Ver tienda ↗
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setTheme(loadThemeFor(template))
            }
          >
            Descartar cambios
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            {saved
              ? '✓ Publicado'
              : 'Guardar y publicar'}
          </Button>

          {paletteOpen && (
            <div className="absolute right-0 top-12 z-[70] w-80 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold">
                    Paleta de la tienda
                  </h2>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Elige una combinación o ajusta los colores.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPaletteOpen(false)
                  }
                  className="text-lg leading-none"
                  aria-label="Cerrar colores"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PALETTES.map(
                  (palette) => (
                    <button
                      key={palette.name}
                      type="button"
                      onClick={() =>
                        updateTheme({
                          paletteName:
                            palette.name,
                          primaryColor:
                            palette.primary,
                          secondaryColor:
                            palette.secondary,
                          accentColor:
                            palette.accent,
                        })
                      }
                      className={`rounded-xl border p-2 text-left ${
                        theme.paletteName ===
                        palette.name
                          ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/15'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <div className="flex gap-1 mb-2">
                        <span
                          className="h-6 flex-1 rounded"
                          style={{
                            background:
                              palette.primary,
                          }}
                        />
                        <span
                          className="h-6 flex-1 rounded"
                          style={{
                            background:
                              palette.secondary,
                          }}
                        />
                        <span
                          className="h-6 flex-1 rounded"
                          style={{
                            background:
                              palette.accent,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold">
                        {palette.name}
                      </span>
                    </button>
                  ),
                )}
              </div>

              <div className="mt-4 grid gap-3">
                {[
                  [
                    'Principal',
                    'primaryColor',
                  ],
                  [
                    'Secundario',
                    'secondaryColor',
                  ],
                  [
                    'Acento',
                    'accentColor',
                  ],
                ].map(
                  ([label, key]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>{label}</span>
                      <input
                        type="color"
                        value={
                          theme[
                            key as keyof Pick<
                              ThemeTemplateCustomization,
                              | 'primaryColor'
                              | 'secondaryColor'
                              | 'accentColor'
                            >
                          ] as string
                        }
                        onChange={(
                          event,
                        ) =>
                          updateTheme({
                            paletteName:
                              'Personalizada',
                            [key]:
                              event.target
                                .value,
                          })
                        }
                        className="h-9 w-14 cursor-pointer rounded border border-[var(--border)] bg-white"
                      />
                    </label>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="pt-16 h-screen">
        <iframe
          ref={iframeRef}
          title="Vista real del cliente"
          src={templatePaths[template]}
          onLoad={attachEditorEvents}
          className="w-full h-full border-0 bg-white"
        />
      </main>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="¿Aplicar estos cambios a tu tienda?"
        size="sm"
      >
      
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          Los visitantes de tu tienda verán este diseño de inmediato. Puedes
          seguir editando si algo no te convence todavía.
        </p>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(false)}
          >
            Seguir editando
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              saveAndPublish();
              setConfirmOpen(false);
            }}
          >
            Sí, aplicar a mi tienda
          </Button>
        </div>
            </Modal>

      {selectedImage && (
        <div
          className="fixed z-[80] w-[310px] rounded-2xl border border-[var(--border)] bg-white shadow-2xl"
          style={{
            top: selectedImage.top,
            left: selectedImage.left,
          }}
        >
          <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm">
                Editar imagen
              </p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">
                {selectedImage.label}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedImage(null)
              }
              className="text-lg"
              aria-label="Cerrar edición de imagen"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-4">
            <label className="block">
              <span className="text-xs font-medium">
                Imagen
              </span>
              <input
                type="text"
                value={imageSetting.src}
                onChange={(event) =>
                  updateSelectedImage({
                    src: event.target.value,
                  })
                }
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] px-3 text-xs outline-none focus:border-[var(--primary)]"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs">
                <span>Escala</span>
                <span>
                  {imageSetting.scale}%
                </span>
              </div>
              <input
                type="range"
                min="80"
                max="180"
                value={imageSetting.scale}
                onChange={(event) =>
                  updateSelectedImage({
                    scale: Number(
                      event.target.value,
                    ),
                  })
                }
                className="w-full"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs">
                <span>
                  Posición horizontal
                </span>
                <span>
                  {imageSetting.x}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSetting.x}
                onChange={(event) =>
                  updateSelectedImage({
                    x: Number(
                      event.target.value,
                    ),
                  })
                }
                className="w-full"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs">
                <span>
                  Posición vertical
                </span>
                <span>
                  {imageSetting.y}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSetting.y}
                onChange={(event) =>
                  updateSelectedImage({
                    y: Number(
                      event.target.value,
                    ),
                  })
                }
                className="w-full"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs">
                <span>
                  Redondeado
                </span>
                <span>
                  {imageSetting.radius}px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="48"
                value={imageSetting.radius}
                onChange={(event) =>
                  updateSelectedImage({
                    radius: Number(
                      event.target.value,
                    ),
                  })
                }
                className="w-full"
              />
            </label>

            <Button
              fullWidth
              variant="outline"
              onClick={resetSelectedImage}
            >
              Restablecer imagen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
