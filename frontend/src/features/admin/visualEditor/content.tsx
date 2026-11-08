
import { Link } from 'react-router-dom';

import type { VisualSectionId } from './sections';
import type { LandingConfig } from '../../landing/types/landing.types';

import { ImageUpload } from '../components/ui/ImageUpload';

type ContentInspectorProps = {
  section: VisualSectionId;
  error: string;
  home: boolean;
  landing?: LandingConfig;
  onChange?: (value: LandingConfig) => void;
  imagesOnly?: boolean;
};

export function ContentInspector({
  section,
  error,
  home,
  landing,
  onChange,
  imagesOnly = false,
}: ContentInspectorProps) {
  if (section === 'topBar') {
    return (
      <p className="ve-hint">
        El logo institucional está protegido e integrado
        al encabezado. Su color se comparte con el pie
        desde Estilo general.
      </p>
    );
  }

  const hero = ['hero', 'heroCta', 'global'].includes(section);

  const logo = ['header', 'footer', 'global'].includes(section);

  const showContact = [
    'contact',
    'location',
    'global',
  ].includes(section);

  const carouselCount = landing?.imagenes_carrusel?.length ?? 0;

  return (
    <div className="ve-content-panel">
      <h2>
        {imagesOnly
          ? 'Imágenes de tu tienda'
          : 'Contenido de tu tienda'}
      </h2>

      <p>
        Los cambios de contenido se previsualizan al instante.
        Al guardar, se actualiza la información de Página principal.
      </p>

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {landing && onChange && (
        <>
          {/* Textos de la portada */}
          {!imagesOnly && hero && (
            <>
              <label>
                Título de portada

                <input
                  aria-label="Título de portada"
                  value={landing.titulo}
                  maxLength={255}
                  onChange={event =>
                    onChange({
                      ...landing,
                      titulo: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Descripción de portada

                <textarea
                  aria-label="Descripción de portada"
                  value={landing.descripcion}
                  rows={3}
                  onChange={event =>
                    onChange({
                      ...landing,
                      descripcion: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Texto del botón

                <input
                  aria-label="Texto del botón"
                  value={landing.texto_boton}
                  maxLength={100}
                  onChange={event =>
                    onChange({
                      ...landing,
                      texto_boton: event.target.value,
                    })
                  }
                />
              </label>
            </>
          )}

          {/* Fotografías: se administran solo en Página principal */}
          {(hero || imagesOnly) && (
            <div>
              <h3>Fotografías de portada</h3>

              <p className="ve-hint">
                Las fotografías se administran desde
                Página principal → Portada.
              </p>

              <p className="ve-hint">
                Desde este editor podrás configurar
                su presentación, comportamiento y transiciones,
                sin modificar las fotografías originales.
              </p>

              <p className="ve-hint">
                Fotografías del carrusel: {carouselCount}
              </p>

              {carouselCount === 0 && landing.imagen_principal && (
                <p className="ve-hint">
                  Actualmente se utiliza la imagen principal
                  de la tienda como portada.
                </p>
              )}

              <Link
                className="ve-content-link"
                to="/emprendedor/landing#pagina-principal"
              >
                Administrar fotografías de portada →
              </Link>
            </div>
          )}

          {/* Logo del emprendimiento: se conserva la edición actual */}
          {(logo || imagesOnly) && (
            <div>
              <h3>Logo del emprendimiento</h3>

              <ImageUpload
                label="Cambiar logo del negocio"
                value={landing.logo || ''}
                maxMB={1}
                allowSVG={false}
                onChange={value =>
                  onChange({
                    ...landing,
                    logo: value || null,
                  })
                }
              />
            </div>
          )}

          {/* Visibilidad de información de la tienda */}
          {showContact && !imagesOnly && (
            <div>
              <h3>Visibilidad de información</h3>

              {[
                'Información de contacto',
                'Horarios de atención',
                'Mapa / ubicación',
              ].map(name => {
                const checked =
                  name === 'Horarios de atención' &&
                  landing.secciones[name] === undefined
                    ? landing.secciones[
                        'Información de contacto'
                      ] !== false
                    : landing.secciones[name] !== false;

                return (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={event =>
                        onChange({
                          ...landing,
                          secciones: {
                            ...landing.secciones,
                            [name]: event.target.checked,
                          },
                        })
                      }
                    />

                    {name}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Acceso a administración de contenido */}
      <Link
        className="ve-content-link"
        to="/emprendedor/landing#pagina-principal"
      >
        Administrar contenido avanzado →
      </Link>

      {!home && (
        <Link
          className="ve-content-link"
          to="/emprendedor/productos"
        >
          Administrar productos y fotografías →
        </Link>
      )}
    </div>
  );
}
