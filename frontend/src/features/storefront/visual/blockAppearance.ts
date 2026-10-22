export type BlockDevice = 'desktop' | 'tablet' | 'mobile';
export type BlockAppearance = Record<string, string | number>;
export type BlockStyles = Record<string, Partial<Record<BlockDevice | 'base', BlockAppearance>>>;
type Field = { label: string; group: string; variable?: string; unit?: string; min?: number; max?: number; options?: string[]; default: string | number };
export const BLOCK_FIELDS: Record<string, Field> = {
  verticalAlign:{label:'Posición vertical del contenido',group:'Distribución',variable:'align',options:['start','center','end'],default:'center'},
  layout:{label:'Distribución',group:'Distribución',options:['left','right','stack'],default:'left'},
  width:{label:'Ancho máximo',group:'Contenedor',variable:'width',unit:'px',min:280,max:1800,default:1120},
  height:{label:'Alto mínimo',group:'Contenedor',variable:'height',unit:'px',min:0,max:1200,default:0},
  margin:{label:'Margen vertical',group:'Contenedor',variable:'margin',unit:'px',min:0,max:160,default:40},
  padding:{label:'Espacio interior',group:'Contenedor',variable:'padding',unit:'px',min:0,max:120,default:32},
  gap:{label:'Separación de elementos',group:'Contenedor',variable:'gap',unit:'px',min:0,max:120,default:40},
  background:{label:'Fondo',group:'Bordes y fondo',variable:'background',default:'transparent'},
  borderColor:{label:'Color del borde',group:'Bordes y fondo',variable:'border-color',default:'#e2e8f0'},
  borderWidth:{label:'Grosor del borde',group:'Bordes y fondo',variable:'border-width',unit:'px',min:0,max:12,default:0},
  radius:{label:'Esquinas',group:'Bordes y fondo',variable:'radius',unit:'px',min:0,max:80,default:0},
  imageWidth:{label:'Ancho de imagen',group:'Imagen',variable:'image-width',unit:'%',min:20,max:100,default:100},
  imageHeight:{label:'Alto de imagen',group:'Imagen',variable:'image-height',unit:'px',min:80,max:1000,default:360},
  imageRatio:{label:'Proporción',group:'Imagen',variable:'image-ratio',options:['auto','1 / 1','4 / 3','3 / 2','16 / 9','3 / 4'],default:'auto'},
  imageFit:{label:'Encuadre',group:'Imagen',variable:'image-fit',options:['cover','contain'],default:'cover'},
  imageX:{label:'Posición horizontal',group:'Imagen',variable:'image-x',unit:'%',min:0,max:100,default:50},
  imageY:{label:'Posición vertical',group:'Imagen',variable:'image-y',unit:'%',min:0,max:100,default:50},
  imageScale:{label:'Ampliación',group:'Imagen',variable:'image-scale',min:1,max:2,default:1},
  galleryColumns:{label:'Columnas de galería',group:'Imagen',variable:'gallery-columns',min:1,max:4,default:3},
};
for (const [part,label,size,weight] of [['title','Título',40,600],['subtitle','Subtítulo',14,500],['body','Párrafos',16,400]] as const) {
  BLOCK_FIELDS[`${part}Size`] = {label:`Tamaño · ${label}`,group:label,variable:`${part}-size`,unit:'px',min:10,max:96,default:size};
  BLOCK_FIELDS[`${part}Font`] = {label:`Tipografía · ${label}`,group:label,variable:`${part}-font`,options:['inherit','Arial','Georgia','Inter','DM Serif Display','Plus Jakarta Sans','system-ui'],default:'inherit'};
  BLOCK_FIELDS[`${part}Weight`] = {label:`Peso · ${label}`,group:label,variable:`${part}-weight`,options:['300','400','500','600','700','800'],default:String(weight)};
  BLOCK_FIELDS[`${part}Color`] = {label:`Color · ${label}`,group:label,variable:`${part}-color`,default:'inherit'};
  BLOCK_FIELDS[`${part}Align`] = {label:`Alineación · ${label}`,group:label,variable:`${part}-align`,options:['left','center','right','justify'],default:'left'};
}
export const validBlockId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function cleanBlockAppearance(value: unknown): BlockAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: BlockAppearance = {};
  for (const [key,field] of Object.entries(BLOCK_FIELDS)) {
    const v = (value as BlockAppearance)[key];
    if (field.min !== undefined && typeof v === 'number' && Number.isFinite(v)) next[key] = Math.max(field.min,Math.min(field.max!,v));
    else if (field.options?.includes(String(v))) next[key] = String(v);
    else if (!field.options && field.min === undefined && typeof v === 'string' && /^(#[\da-f]{3}(?:[\da-f]{3}|[\da-f]{5})?|inherit|transparent)$/i.test(v)) next[key] = v;
  }
  return next;
}
export function readBlockStyles(value: unknown): BlockStyles {
  const next: BlockStyles = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;
  for (const [id,variants] of Object.entries(value).slice(0,100)) {
    if (!validBlockId(id) || !variants || typeof variants !== 'object') continue;
    const clean: BlockStyles[string] = {};
    for (const device of ['base','desktop','tablet','mobile'] as const) {
      const fields = cleanBlockAppearance((variants as Record<string,unknown>)[device]);
      if (Object.keys(fields).length) clean[device] = fields;
    }
    if (Object.keys(clean).length) next[id] = clean;
  }
  return next;
}
export function resolveBlockAppearance(styles: BlockStyles, id: string, device: BlockDevice): BlockAppearance {
  return {...Object.fromEntries(Object.entries(BLOCK_FIELDS).map(([key,field]) => [key,field.default])),...styles[id]?.base,...styles[id]?.[device]};
}
export function editBlockAppearance(styles: BlockStyles, id: string, key: string, value: string | number, scope: 'all' | 'device', device: BlockDevice): BlockStyles {
  const clean = cleanBlockAppearance({[key]:value});
  if (!validBlockId(id) || clean[key] === undefined) return styles;
  const variants = {...styles[id]};
  if (scope === 'all') {
    variants.base = {...variants.base,...clean};
    for (const screen of ['desktop','tablet','mobile'] as const) { variants[screen] = {...variants[screen]}; delete variants[screen]![key]; }
  } else variants[device] = {...variants[device],...clean};
  return readBlockStyles({...styles,[id]:variants});
}
function declarations(fields: BlockAppearance): string {
  return Object.entries(fields).map(([key,value]) => {
    if (key === 'layout') return `--lb-columns:${value === 'stack' ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))'};--lb-image-order:${value === 'right' ? 2 : 0};`;
    if (key === 'imageRatio') return `--lb-image-ratio:${value};--lb-ratio-height:${value === 'auto' ? 'var(--lb-image-height,360px)' : 'auto'};`;
    const field = BLOCK_FIELDS[key];
    return field?.variable ? `--lb-${field.variable}:${value}${field.unit ?? ''};` : '';
  }).join('');
}
export function blockStyleSheet(raw: unknown): string {
  return Object.entries(readBlockStyles(raw)).map(([id,variants]) => {
    const selector = `[data-content-block-id="${id}"]`;
    return `${selector}{${declarations(variants.base ?? {})}}` +
      (['desktop','tablet','mobile'] as const).map(device => `${{desktop:'@media(min-width:1024px)',tablet:'@media(min-width:640px) and (max-width:1023px)',mobile:'@media(max-width:639px)'}[device]}{${selector}{${declarations(variants[device] ?? {})}}}`).join('');
  }).join('');
}
