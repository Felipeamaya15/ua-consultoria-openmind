import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { ImageUpload } from './ui/ImageUpload';
import { Button, Modal } from './ui';
import { SectionMediaItem } from '../../landing/components/SectionElements';
import { fetchSectionLibrary } from '../../landing/services/sectionResources';
import { saveMediaResource } from '../../marketing/services/mediaLibraryService';
import type { MediaResource } from '../../marketing/domain/mediaLibrary';
import type { ImagenBloqueLanding } from '../../landing/types/landing.types';

type Props = {
  value?: ImagenBloqueLanding;
  onChange: (value: ImagenBloqueLanding | null) => void;
};

async function validateVideo(file: File): Promise<void> {
  if (!/\.(mp4|webm)$/i.test(file.name) ||
      !['video/mp4', 'video/webm', ''].includes(file.type)) {
    throw new Error('Selecciona un video MP4 o WebM.');
  }
  if (!file.size || file.size > 20 * 1024 * 1024) {
    throw new Error('El archivo original no puede superar 20 MB.');
  }

  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const video = document.createElement('video');
      const timer = window.setTimeout(() => {
        reject(new Error('No se pudo leer el video.'));
      }, 12000);

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          reject(new Error('Duracion no valida.'));
        } else if (video.duration > 15) {
          reject(new Error('Maximo 15 segundos por video.'));
        } else {
          resolve();
        }
      };

      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('El archivo no es un video compatible.'));
      };

      video.preload = 'metadata';
      video.src = url;
      video.load();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SectionMediaField({ value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [library, setLibrary] = useState<MediaResource[]>([]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetchSectionLibrary(controller.signal)
      .then(items => {
        if (!controller.signal.aborted) setLibrary(items);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('No se pudo cargar la biblioteca.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  function make(fields: Partial<ImagenBloqueLanding>) {
    return {
      id: value?.id || crypto.randomUUID(),
      src: '',
      alt: value?.alt || '',
      ...fields,
    };
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');

    try {
      await validateVideo(file);
      const saved = await saveMediaResource(
        null,
        {
          titulo: file.name.slice(0, 180),
          descripcion: '',
          tipo: 'video',
          url: '',
          activo: true,
        },
        file,
        false
      );

      if (saved.tipo !== 'video' || !saved.archivo) {
        throw new Error('No se pudo confirmar el video guardado.');
      }

      onChange(make({ video_recurso_id: saved.id }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No se pudo subir.'
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function choose(resource: MediaResource) {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      if (resource.tipo === 'video') {
        onChange(make({ video_recurso_id: resource.id }));
      } else if (resource.tipo === 'imagen') {
        let src = resource.url;

        if (resource.archivo) {
          const token =
            localStorage.getItem('token') ||
            sessionStorage.getItem('token');

          if (!token) throw new Error('Inicia sesion nuevamente.');

          const response = await fetch(
            `${API_BASE_URL}/api/landing/biblioteca/${resource.id}/imagen/`,
            {
              headers: { Authorization: `Token ${token}` },
              cache: 'no-store',
            }
          );

          if (!response.ok) throw new Error('Imagen no disponible.');

          const blob = await response.blob();

          if (blob.size > 2 * 1024 * 1024) {
            throw new Error('Imagen demasiado grande.');
          }

          src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.readAsDataURL(blob);
          });
        }

        if (!src) throw new Error('Imagen no disponible.');
        onChange(make({ src }));
      }

      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo seleccionar el recurso.'
      );
    } finally {
      setBusy(false);
    }
  }

  const choices = library.filter(resource =>
    resource.activo &&
    (resource.tipo === 'imagen' || resource.tipo === 'video') &&
    (Boolean(resource.archivo) || Boolean(resource.url))
  );

  return (
    <div className="space-y-3">
      {value && (value.src || value.video_recurso_id) && (
        <div className="space-y-2">
          <SectionMediaItem item={value} privatePreview />
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(null)}
          >
            Quitar contenido multimedia
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ImageUpload
          label="Subir imagen"
          value={value?.src || ''}
          maxMB={2}
          allowSVG={false}
          onChange={src => onChange(src ? make({ src }) : null)}
        />

        <div className="border-2 border-dashed rounded-xl p-5 text-center">
          <input
            ref={input}
            type="file"
            accept=".mp4,.webm,video/mp4,video/webm"
            className="hidden"
            disabled={busy}
            aria-label="Subir video"
            onChange={event => {
              void upload(event.target.files?.[0]);
            }}
          />

          <Button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Subiendo...' : 'Subir video'}
          </Button>

          <p className="text-xs mt-3">
            MP4 o WebM, hasta 15 s. Entrada: 20 MB. Salida optimizada: 4 MB.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Seleccionar desde biblioteca multimedia
      </Button>

      {error && <p role="alert" className="text-red-600">{error}</p>}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Seleccionar imagen o video"
        size="xl"
        portal
      >
        {loading ? (
          <p>Cargando biblioteca...</p>
        ) : choices.length ? (
          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {choices.map(resource => (
              <button
                type="button"
                key={resource.id}
                disabled={busy}
                className="text-left border rounded-lg p-3"
                onClick={() => { void choose(resource); }}
              >
                <strong>{resource.titulo}</strong>
                <span className="block text-sm">
                  {resource.tipo === 'video' ? 'Video' : 'Imagen'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p>No hay imagenes o videos disponibles.</p>
        )}
      </Modal>
    </div>
  );
}
