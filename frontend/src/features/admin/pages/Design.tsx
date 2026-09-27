import { useState } from "react"
import { Link } from "react-router-dom"
import { useAdmin } from "../context/AdminContext"
import { TemplateId } from "../data/mockAdminData"
import { templatePaths } from "../config/navigation"
import { openAdminWindow } from "../auth/demoSession"
import { Button, Alert, Badge } from "../components/ui"

const TEMPLATES: {
  id: TemplateId
  name: string
  description: string
  tags: string[]
  preview: string
}[] = [
  {
    id: "editorial",
    name: "Plantilla 01 — Studio Pop",
    description:
      "Tienda luminosa y modular con escaparate visual, CTA vibrante y compra rápida.",
    tags: ["Modular", "Color", "Editorial"],
    preview:
      "https://images.unsplash.com/photo-1555212697-194d092e3b8f?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "minimal",
    name: "Plantilla 02 — Soft Discovery",
    description:
      "Estilo Shop con bordes redondeados suaves (28px), buscador en píldora con acento violeta (#5433eb) y tarjetas ultra suaves.",
    tags: ["Pillow-soft", "Shop Violet", "Clean Canvas"],
    preview:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "visual",
    name: "Plantilla 03 — Velta Editorial",
    description:
      "Imágenes a pantalla completa, navegación superpuesta oscura, bloques de producto con gran protagonismo visual.",
    tags: ["Oscuro", "Full-bleed", "Editorial"],
    preview:
      "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "catalog",
    name: "Plantilla 04 — Obsidian Showcase",
    description:
      "Vitrina oscura premium, producto protagonista y acción de compra enfocada.",
    tags: ["Premium", "Oscuro", "Showcase"],
    preview:
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=250&fit=crop&auto=format",
  },
]

const templateOptions = TEMPLATES.map((template) => ({
  value: template.id,
  label: template.name,
}))

export default function Design() {
  const {
    config,
    setConfig,
    updateTemplate,
    previewTemplate,
    setPreviewTemplate,
  } = useAdmin()

  const [saved, setSaved] = useState(false)
  const [colorsSaved, setColorsSaved] = useState(false)
  const activeTemplate = previewTemplate ?? config.template
  const activeTheme =
    config.themeEditor?.[activeTemplate] ?? {
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      accentColor: config.accentColor,
      paletteName: "Original",
      images: {},
    }

  const palettes = [
    { name: "Original", primaryColor: "#1a3a6b", secondaryColor: "#eef1f8", accentColor: "#e04b1a" },
    { name: "Oceano", primaryColor: "#2563eb", secondaryColor: "#eff6ff", accentColor: "#0ea5e9" },
    { name: "Bosque", primaryColor: "#15803d", secondaryColor: "#f0fdf4", accentColor: "#84cc16" },
    { name: "Grafito", primaryColor: "#1f2937", secondaryColor: "#f3f4f6", accentColor: "#f97316" },
  ]

  const updateColors = (
    patch: Partial<typeof activeTheme>,
  ) => {
    const nextTheme = {
      ...activeTheme,
      ...patch,
      images: activeTheme.images,
    }

    const ok = setConfig({
      ...config,
      primaryColor: nextTheme.primaryColor,
      secondaryColor: nextTheme.secondaryColor,
      accentColor: nextTheme.accentColor,
      themeEditor: {
        ...config.themeEditor,
        [activeTemplate]: nextTheme,
      },
    })

    if (ok) {
      setColorsSaved(true)
      setTimeout(() => setColorsSaved(false), 1800)
    }
  }

  const handleSave = () => {
    if (previewTemplate) updateTemplate(previewTemplate)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleOpenEditor = () => {
    if (!previewTemplate) return

    openAdminWindow(
      `/emprendedor/diseno/editor?plantilla=${previewTemplate}`,
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <Alert variant="info">
        Al cambiar de plantilla, todos tus productos, precios e imágenes se
        mantienen intactos. Solo cambia la presentación visual.
      </Alert>

      {saved && (
        <Alert variant="success">
          Plantilla seleccionada. El botón Ver tienda abrirá su ruta.
        </Alert>
      )}
      {colorsSaved && (
        <Alert variant="success">
          Colores guardados para la plantilla seleccionada.
        </Alert>
      )}

      <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold">
              Colores de la tienda
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Ajusta la paleta usada por botones, acentos y fondos de apoyo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: activeTheme.primaryColor }} />
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: activeTheme.secondaryColor }} />
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: activeTheme.accentColor }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {palettes.map((palette) => (
            <button
              key={palette.name}
              type="button"
              onClick={() => updateColors({
                ...palette,
                paletteName: palette.name,
              })}
              className={`rounded-xl border p-2 text-left transition-colors ${
                activeTheme.paletteName === palette.name
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/15"
                  : "border-[var(--border)] hover:border-[var(--muted-foreground)]"
              }`}
            >
              <div className="flex gap-1 mb-2">
                <span className="h-7 flex-1 rounded" style={{ background: palette.primaryColor }} />
                <span className="h-7 flex-1 rounded" style={{ background: palette.secondaryColor }} />
                <span className="h-7 flex-1 rounded" style={{ background: palette.accentColor }} />
              </div>
              <span className="text-xs font-semibold">
                {palette.name}
              </span>
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ["Principal", "primaryColor"],
            ["Secundario", "secondaryColor"],
            ["Acento", "accentColor"],
          ].map(([label, key]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <span className="text-sm">{label}</span>
              <input
                type="color"
                value={activeTheme[key as "primaryColor" | "secondaryColor" | "accentColor"]}
                onChange={(event) =>
                  updateColors({
                    paletteName: "Personalizada",
                    [key]: event.target.value,
                  })
                }
                className="h-9 w-14 cursor-pointer rounded border border-[var(--border)] bg-white"
              />
            </label>
          ))}
        </div>
      </div>



      <div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">
              Selecciona una plantilla
            </h2>

            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Puedes elegir desde el selector o revisar cada propuesta visual.
            </p>
          </div>

          <label className="w-full sm:w-80">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">
              Plantilla activa
            </span>

            <select
              value={previewTemplate ?? config.template}
              onChange={(event) =>
                setPreviewTemplate(event.target.value as TemplateId)
              }
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
            >
              {templateOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TEMPLATES.map((tpl) => {
            const isActive = config.template === tpl.id
            const isPreviewing = previewTemplate === tpl.id

            return (
              <div
                key={tpl.id}
                className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${
                  isPreviewing
                    ? "border-[var(--primary)] shadow-lg"
                    : isActive
                      ? "border-[var(--success)]"
                      : "border-[var(--border)] hover:border-[var(--muted-foreground)]"
                }`}
              >
                <div className="relative aspect-video overflow-hidden bg-[var(--muted)]">
                  <img
                    src={tpl.preview}
                    alt={tpl.name}
                    className="w-full h-full object-cover"
                  />

                  {isActive && !isPreviewing && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="success">
                        Actual
                      </Badge>
                    </div>
                  )}

                  {isPreviewing && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="info">
                        Previsualizando
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">
                        {tpl.name}
                      </h3>

                      <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        {tpl.description}
                      </p>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="default"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTemplate(
                          isPreviewing ? null : tpl.id,
                        )
                      }
                      className="flex-1 h-8 text-xs font-medium border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                    >
                      {isPreviewing
                        ? "Cancelar preview"
                        : "Previsualizar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPreviewTemplate(tpl.id)
                      }}
                      className="flex-1 h-8 text-xs font-semibold bg-[var(--primary)] text-white rounded-lg hover:bg-[#0f2a56] transition-colors disabled:opacity-50"
                      disabled={isActive && !isPreviewing}
                    >
                      {isActive ? "Activa" : "Usar esta"}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {previewTemplate && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-semibold">
              Previsualizando:{" "}
              <span className="text-[var(--primary)]">
                {
                  TEMPLATES.find(
                    (t) => t.id === previewTemplate,
                  )?.name
                }
              </span>
            </p>

            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Tu tienda actual no ha cambiado. Confirma para aplicar.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={templatePaths[previewTemplate]}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
              >
                Ver preview →
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEditor}
            >
              Abrir editor →
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
            >
              {saved ? "✓ Aplicada" : "Aplicar plantilla"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setPreviewTemplate(null)
              }
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
