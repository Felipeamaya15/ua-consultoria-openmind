import { PaletteLibrary } from '../../../shared/PaletteLibrary';
import { usePaletteLibrary, saveAppearance, paletteOverrides, type Appearance, type StorePalette } from '../../../shared/palettes';
import { resolveStoreVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import { useEffect, useState } from "react"
import { Link, useBlocker } from "react-router-dom"
import { useAdmin } from "../context/AdminContext"
import { TemplateId } from "../data/mockAdminData"
import { templatePaths } from "../config/navigation"
import { openAdminWindow } from "../auth/demoSession"
import { Button, Alert, Badge, Modal } from "../components/ui"
import { AdminHelp } from '../components/AdminPageHeader';
import { clearEditorColorOverrides, loadThemeCustomization, patchThemeCustomization } from '../data/themeCustomization';

const TEMPLATES: {
  id: TemplateId
  name: string
  description: string
  tags: string[]
  preview: string
}[] = [
  {
    id: "editorial",
    name: "Studio Pop",
    description:
      "Colorida, moderna y dinámica. Ideal para una marca con personalidad.",
    tags: ["Modular", "Color", "Editorial"],
    preview:
      "https://images.unsplash.com/photo-1555212697-194d092e3b8f?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "minimal",
    name: "Soft Discovery",
    description:
      "Suave, cercana y fácil de recorrer. Una experiencia acogedora para tus clientes.",
    tags: ["Suave", "Cercana", "Luminosa"],
    preview:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "visual",
    name: "Velta Editorial",
    description:
      "Elegante y enfocada en fotografía. Cuenta tu historia con imágenes.",
    tags: ["Fotografía", "Elegancia", "Historia"],
    preview:
      "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&h=250&fit=crop&auto=format",
  },
  {
    id: "catalog",
    name: "Obsidian Showcase",
    description:
      "Oscura, premium y minimalista. Tus productos son protagonistas.",
    tags: ["Premium", "Oscuro", "Minimalista"],
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
    previewTemplate,
    setPreviewTemplate,
  } = useAdmin()

const [saved,setSaved]=useState(false);
  const activeTemplate=previewTemplate??config.template;
  const paletteSource=usePaletteLibrary();
  const [paletteNotice,setPaletteNotice]=useState('');
  const [paletteDrafts,setPaletteDrafts]=useState<Partial<Record<TemplateId,StorePalette>>>({});
  const [paletteBusy,setPaletteBusy]=useState(false);
  const paletteSelection=paletteDrafts[activeTemplate];
  const colors=paletteSelection?.colores??resolveStoreVisualConfig(config,activeTemplate,paletteSource.appearance?.[activeTemplate]?{visualConfig:paletteOverrides(paletteSource.appearance[activeTemplate],paletteSource.library)}:undefined).global.colors;
  const dirty=Object.keys(paletteDrafts).length>0||!!(previewTemplate&&previewTemplate!==config.template);
  const blocker=useBlocker(dirty);
  useEffect(()=>{
    if(!dirty)return;
    const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);
  },[dirty]);
  function discard(){setPaletteDrafts({});setPreviewTemplate(null);setPaletteNotice('');setSaved(false);}
  async function handleSave():Promise<boolean>{
    if(paletteBusy)return false;
    setPaletteBusy(true);setSaved(false);setPaletteNotice('');
    try{
      const appearances:Appearance={};let nextConfig={...config,themeEditor:{...config.themeEditor}};
      for(const [key,palette] of Object.entries(paletteDrafts)){
        const id=key as TemplateId;if(!palette)continue;
        const theme=loadThemeCustomization(id,config.themeEditor?.[id],config,config.visualConfig);
        const base=paletteSource.appearance?.[id]?.visualConfig??theme.visualConfig;
        const visualConfig={...base,global:{...base?.global,colors:palette.colores}};
        appearances[id]={visualConfig,paleta_id:palette.id.startsWith('system-')?null:palette.id};
        nextConfig.themeEditor[id]=patchThemeCustomization(theme,{visualConfig,paletteName:palette.nombre});
      }
      if(Object.keys(appearances).length)await saveAppearance(appearances);
      if(!setConfig({...nextConfig,template:previewTemplate??config.template}))throw new Error('No pudimos guardar la copia local. Los cambios de paleta enviados al servidor se conservan; vuelve a intentar.');
      setPaletteDrafts({});setPreviewTemplate(null);setSaved(true);return true;
    }catch(error){setPaletteNotice(error instanceof Error?error.message:'No se pudieron guardar los cambios.');return false;}
    finally{setPaletteBusy(false);}
  }
  }

  const handleOpenEditor = () => {
    if (!previewTemplate) return

    openAdminWindow(
      `/emprendedor/diseno/editor?plantilla=${previewTemplate}`,
    )
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <AdminHelp>
        Al cambiar de plantilla, todos tus productos, precios e imágenes se
        mantienen intactos. Solo cambia la presentación visual.
      </AdminHelp>

      {saved && (
        <Alert variant="success">
          Cambios guardados. Las paletas están disponibles para tu tienda.
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty&&<Button type="button" variant="outline" disabled={paletteBusy} onClick={discard}>Descartar cambios</Button>}
        <Button type="button" disabled={!dirty||paletteBusy} onClick={()=>void handleSave()}>{paletteBusy?'Guardando…':'Guardar cambios'}</Button>
      </div>{paletteNotice&&<p role="alert">{paletteNotice}</p>}


      <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold">
              Colores de la tienda
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Elige la identidad de colores de tu tienda. Esta paleta se aplicará automáticamente a las 4 plantillas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: colors.primary }} />
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: colors.secondary }} />
            <span className="w-7 h-7 rounded-full border border-[var(--border)]" style={{ background: colors.accent }} />
          </div>
        </div>

<PaletteLibrary
          colors={colors}
          selectedId={paletteSelection?.id ?? paletteSource.appearance?.[activeTemplate]?.paleta_id}
          onApply={palette => {
            setPaletteDrafts({
              editorial: palette,
              minimal: palette,
              visual: palette,
              catalog: palette,
            });
            setSaved(false);
          }}
        />
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
      <Modal open={blocker.state==='blocked'} onClose={()=>{if(!paletteBusy)blocker.reset?.();}} title="Tienes cambios sin guardar" size="sm"><p>Guarda la elección de plantilla y paleta antes de continuar.</p><div className="flex flex-wrap justify-end gap-2 mt-4"><Button type="button" variant="outline" disabled={paletteBusy} onClick={()=>blocker.reset?.()}>Cancelar</Button><Button type="button" variant="outline" disabled={paletteBusy} onClick={()=>blocker.proceed?.()}>Continuar sin guardar</Button><Button type="button" disabled={paletteBusy} onClick={()=>void handleSave().then(ok=>{if(ok)blocker.proceed?.();})}>Guardar y continuar</Button></div></Modal>
    </div>
  )
}
