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

export default function Design() {
  const {
    config,
    updateTemplate,
    previewTemplate,
    setPreviewTemplate,
  } = useAdmin()

  const [saved, setSaved] = useState(false)

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

      <div>
        <h2 className="font-semibold mb-4">
          Selecciona una plantilla
        </h2>

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