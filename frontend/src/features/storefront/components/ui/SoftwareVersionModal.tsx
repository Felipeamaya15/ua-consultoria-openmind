import { useEffect, useState } from 'react';
import { softwareVersionService, type SoftwareVersionInfo, defaultSoftwareVersion } from '../../services/softwareVersionService';

interface SoftwareVersionModalProps {
  open: boolean;
  onClose: () => void;
}

export function SoftwareVersionModal({ open, onClose }: SoftwareVersionModalProps) {
  const [info, setInfo] = useState<SoftwareVersionInfo>(defaultSoftwareVersion);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    softwareVersionService
      .getSoftwareVersion()
      .then((data) => {
        if (active) setInfo(data);
      })
      .catch(() => {
        if (active) setInfo(defaultSoftwareVersion);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="software-version-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white text-neutral-900 border border-neutral-300 rounded-2xl shadow-2xl p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="software-version-title" className="text-base font-bold text-black">
                Versión del Software
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-black border border-neutral-300 bg-transparent">
                v{info.version_vigente} • Vigente
              </span>
            </div>
            <p className="text-xs text-neutral-600 mt-1">{info.sistema}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-neutral-500 hover:text-black p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs leading-relaxed">
          <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200/80">
            <div>
              <p className="text-neutral-500 font-medium">Versión vigente:</p>
              <p className="font-semibold text-black mt-0.5">v{info.version_vigente}</p>
            </div>
            <div>
              <p className="text-neutral-500 font-medium">Estado:</p>
              <p className="font-semibold text-black mt-0.5 capitalize">{info.estado}</p>
            </div>
            <div>
              <p className="text-neutral-500 font-medium">Fecha de vigencia:</p>
              <p className="font-semibold text-black mt-0.5">
                {info.fecha_vigencia
                  ? (() => {
                      const match = info.fecha_vigencia.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                      if (match) {
                        const [, y, m, d] = match;
                        return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('es-CL', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        });
                      }
                      return info.fecha_vigencia;
                    })()
                  : info.fecha_lanzamiento}
              </p>
            </div>
            <div>
              <p className="text-neutral-500 font-medium">Plataforma:</p>
              <p className="font-semibold text-black mt-0.5 truncate">{info.plataforma}</p>
            </div>
          </div>

          {info.detalles?.soporte && (
            <div className="pt-1 text-neutral-600 text-[11px]">
              <p>
                <span className="font-medium text-black">Contacto técnico:</span> {info.detalles.soporte}
              </p>
            </div>
          )}

          {loading && <p className="text-[11px] text-neutral-400 text-center">Actualizando información...</p>}
        </div>

        <div className="pt-3 border-t border-neutral-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-neutral-800 rounded-xl transition-colors shadow-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
