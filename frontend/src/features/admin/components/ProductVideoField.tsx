import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { validateProductVideo } from '../utils/productVideoValidation';

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  savedResourceId?: string | null;
  onRemoveSaved?: () => void;
};

export function ProductVideoField({ file, onChange, savedResourceId, onRemoveSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = '';

    if (!selected) return;

    setProcessing(true);
    setFailed(false);
    setMessage('');

    try {
      const seconds = await validateProductVideo(selected);
      onChange(selected);
      setMessage(
        `Video válido: ${seconds.toFixed(1)} segundos. Pendiente de guardar.`
      );
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos validar el video.'
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-[var(--border)] bg-white p-5">
      <h3 className="font-semibold text-sm">
        Video corto del producto
      </h3>

      <p className="text-xs text-[var(--muted-foreground)] mt-1 mb-4">
        Opcional · Un video MP4 o WebM · Máximo 10 segundos. Original hasta 20 MB; comprimido a 3 MB y 720p.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.webm,video/mp4,video/webm"
        className="hidden"
        aria-label="Seleccionar video del producto"
        onChange={selectVideo}
        disabled={processing}
      />

      <button
        type="button"
        disabled={processing}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border-2 border-dashed border-[var(--border)] px-5 py-4 text-sm hover:border-[var(--primary)] disabled:opacity-50"
      >
        {processing
          ? 'Validando video...'
          : file || savedResourceId
            ? 'Reemplazar video'
            : '+ Subir video'}
      </button>

      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`mt-3 text-sm ${failed ? 'text-red-600' : 'text-[var(--foreground)]'}`}
        >
          {message}
        </p>
      )}

      {file && previewUrl && (
        <div className="mt-4 max-w-md">
          <video
            key={previewUrl}
            src={previewUrl}
            controls
            preload="metadata"
            playsInline
            className="w-full rounded-xl bg-black"
          />

          <p className="mt-2 text-xs break-all">
            {file.name}
          </p>

          <button
            type="button"
            className="mt-3 text-sm text-red-600"
            onClick={() => {
              onChange(null);
              setMessage('');
              setFailed(false);
            }}
          >
            Quitar video
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        El video se subirá cuando presiones Guardar producto.
        Puedes reemplazarlo o quitarlo antes de guardar.
      </p>
      {!file && savedResourceId && (
        <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
          <p className="text-sm">Video guardado en el producto.</p>
          <button
            type="button"
            className="mt-2 text-sm text-red-600"
            onClick={onRemoveSaved}
          >
            Quitar video del producto
          </button>
        </div>
      )}    </section>
  );
}