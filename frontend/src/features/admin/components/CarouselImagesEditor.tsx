
import { useEffect, useId, useRef, useState } from 'react';

import {
  deleteCarouselImage,
  fetchCarouselImages,
  MAX_IMAGENES_CARRUSEL,
  MAX_MB_CARRUSEL,
  reorderCarouselImages,
  uploadCarouselImage,
} from '../../landing/services/carruselService';

import {
  IMAGE_ACCEPT,
  IMAGE_FORMATS,
} from '../../../shared/services/imageUpload';

import type {
  ImagenCarruselLanding,
} from '../../landing/types/landing.types';

import './carousel-images-editor.css';

type Operation = 'upload' | 'delete' | 'reorder' | 'refresh' | null;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No pudimos completar la operación. Intenta nuevamente.';
}

export function CarouselImagesEditor() {
  const fileId = useId();
  const descriptionId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImagenCarruselLanding[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const busy = loading || operation !== null;
  const full = images.length >= MAX_IMAGENES_CARRUSEL;

  useEffect(() => {
    let active = true;

    fetchCarouselImages()
      .then(result => {
        if (active) {
          setImages(result);
        }
      })
      .catch(cause => {
        if (active) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Actualizar las fotografías desde Django.
  async function refresh() {
    if (busy) return;

    setOperation('refresh');
    setError('');
    setNotice('');

    try {
      const result = await fetchCarouselImages();

      setImages(result);
      setNotice('Lista de fotografías actualizada.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setOperation(null);
    }
  }

  // Subir JPG, PNG, WebP, HEIC o HEIF.
  async function upload() {
    if (!file || busy || full) return;

    setOperation('upload');
    setError('');
    setNotice('');

    try {
      // El servicio convierte HEIC/HEIF antes de guardar.
      const created = await uploadCarouselImage(
        file,
        description,
      );

      setImages(current =>
        [...current, created].sort(
          (a, b) => a.orden - b.orden,
        ),
      );

      setFile(null);
      setDescription('');

      if (fileInput.current) {
        fileInput.current.value = '';
      }

      setNotice('Fotografía subida y guardada correctamente.');
    } catch (cause) {
      setError(
        `${errorMessage(cause)} Si hubo un problema de conexión, ` +
        'actualiza la lista antes de intentar subirla nuevamente.',
      );
    } finally {
      setOperation(null);
    }
  }

  // Cambiar el orden de las imágenes.
  async function move(index: number, direction: -1 | 1) {
    if (busy) return;

    const target = index + direction;

    if (target < 0 || target >= images.length) {
      return;
    }

    const reordered = [...images];

    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    setOperation('reorder');
    setError('');
    setNotice('');

    try {
      const saved = await reorderCarouselImages(
        reordered.map(image => image.id),
      );

      setImages(saved);
      setNotice('Orden de las fotografías guardado.');
    } catch (cause) {
      setError(
        `${errorMessage(cause)} ` +
        'Actualiza la lista para comprobar el orden guardado.',
      );
    } finally {
      setOperation(null);
    }
  }

  // Eliminar una fotografía.
  async function remove(image: ImagenCarruselLanding) {
    if (busy) return;

    const confirmed = window.confirm(
      '¿Eliminar esta fotografía del carrusel? ' +
      'La eliminación se guarda inmediatamente ' +
      'y no puede deshacerse desde Página principal.',
    );

    if (!confirmed) return;

    setOperation('delete');
    setError('');
    setNotice('');

    try {
      await deleteCarouselImage(image.id);

      setImages(current =>
        current.filter(item => item.id !== image.id),
      );

      setNotice('Fotografía eliminada correctamente.');
    } catch (cause) {
      setError(
        `${errorMessage(cause)} ` +
        'Actualiza la lista para comprobar si se eliminó.',
      );
    } finally {
      setOperation(null);
    }
  }

  return (
    <section
      className="lp-carousel-editor"
      aria-label="Imágenes del carrusel de portada"
      aria-busy={busy}
    >
      <div className="lp-carousel-heading">
        <div>
          <h3>Fotografías del carrusel</h3>

          <p>
            Agrega hasta {MAX_IMAGENES_CARRUSEL} fotografías
            para la portada de tu tienda.
          </p>
        </div>

        <span className="lp-carousel-counter">
          {images.length}/{MAX_IMAGENES_CARRUSEL}
        </span>
      </div>

      <p className="lp-carousel-info">
        Los cambios de fotografías se guardan inmediatamente.
        No dependen del botón general «Guardar cambios».
      </p>

      {error && (
        <p className="lp-carousel-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="lp-carousel-success" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p role="status">
          Cargando fotografías...
        </p>
      ) : (
        <>
          {images.length === 0 ? (
            <p className="lp-carousel-empty">
              Todavía no tienes fotografías en el carrusel.
              Puedes agregar la primera a continuación.
            </p>
          ) : (
            <ol className="lp-carousel-grid">
              {images.map((image, index) => (
                <li
                  className="lp-carousel-item"
                  key={image.id}
                >
                  <img
                    src={image.archivo}
                    alt={
                      image.texto_alternativo ||
                      `Vista previa de fotografía ${index + 1}`
                    }
                    loading="lazy"
                  />

                  <div className="lp-carousel-item-content">
                    <strong>
                      Fotografía {index + 1}
                    </strong>

                    <p>
                      {image.texto_alternativo ||
                        'Sin descripción alternativa'}
                    </p>

                    <div className="lp-carousel-actions">
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => void move(index, -1)}
                        aria-label={
                          `Subir fotografía ${index + 1} una posición`
                        }
                      >
                        ↑ Subir
                      </button>

                      <button
                        type="button"
                        disabled={
                          busy ||
                          index === images.length - 1
                        }
                        onClick={() => void move(index, 1)}
                        aria-label={
                          `Bajar fotografía ${index + 1} una posición`
                        }
                      >
                        ↓ Bajar
                      </button>

                      <button
                        type="button"
                        className="lp-carousel-delete"
                        disabled={busy}
                        onClick={() => void remove(image)}
                        aria-label={
                          `Eliminar fotografía ${index + 1}`
                        }
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <div className="lp-carousel-upload">
        <h4>Agregar fotografía</h4>

        <label htmlFor={fileId}>
          Selecciona una fotografía
        </label>

        <input
          ref={fileInput}
          id={fileId}
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={busy || full}
          onChange={event => {
            setFile(
              event.currentTarget.files?.[0] || null
            );
            setError('');
            setNotice('');
          }}
        />

        <small>
          Formatos {IMAGE_FORMATS}. Máximo{' '}
          {MAX_MB_CARRUSEL} MB por fotografía.
        </small>

        <label htmlFor={descriptionId}>
          Descripción de la fotografía (opcional)
        </label>

        <input
          id={descriptionId}
          type="text"
          value={description}
          maxLength={250}
          disabled={busy || full}
          placeholder="Ej.: Productos destacados de mi tienda"
          onChange={event =>
            setDescription(event.target.value)
          }
        />

        <small>
          Esta descripción ayuda a las personas
          que utilizan lectores de pantalla.
        </small>

        {full && (
          <p className="lp-carousel-info" role="status">
            Alcanzaste el máximo de ocho fotografías.
            Elimina una para agregar otra.
          </p>
        )}

        <div className="lp-carousel-footer">
          <button
            type="button"
            className="lp-button lp-button-primary"
            disabled={!file || busy || full}
            onClick={() => void upload()}
          >
            {operation === 'upload'
              ? 'Procesando y subiendo fotografía...'
              : 'Agregar fotografía'}
          </button>

          <button
            type="button"
            className="lp-button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {operation === 'refresh'
              ? 'Actualizando...'
              : 'Actualizar lista'}
          </button>
        </div>
      </div>
    </section>
  );
}
