import territorio from '../../admin/data/chileTerritory.json';

type Region = { nombre: string; provincias: { comunas: string[] }[] };

const NOMBRE_OFICIAL: Record<string, string> = {
  Metropolitana: 'Metropolitana de Santiago',
  OHiggins: "Libertador General Bernardo O'Higgins",
  Araucanía: 'La Araucanía',
  Aysén: 'Aysén del General Carlos Ibáñez del Campo',
  Magallanes: 'Magallanes y de la Antártica Chilena',
  Arica: 'Arica y Parinacota',
};

export const nombreOficialRegion = (region: string): string => NOMBRE_OFICIAL[region] ?? region;

export const comunasDeRegion = (region: string): string[] => {
  const nombre = nombreOficialRegion(region);
  const encontrada = (territorio as Region[]).find((item) => item.nombre === nombre);
  return (encontrada?.provincias ?? [])
    .flatMap((provincia) => provincia.comunas)
    .sort((a, b) => a.localeCompare(b, 'es'));
};

export const esComunaDeRegion = (comuna: string, region: string) =>
  comunasDeRegion(region).includes(comuna);
