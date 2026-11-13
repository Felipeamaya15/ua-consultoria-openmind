import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { authService } from '../../../auth/services/authService';

import { useAdmin } from '../../context/AdminContext';
import { templatePaths } from '../../config/navigation';
import { Icon } from '../ui';

function formatSessionTime(iso: string | null, nowMs: number): string {
  if (!iso) return 'Sesión activa';
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return 'Sesión activa';
  const diffSec = Math.max(0, Math.floor((nowMs - started.getTime()) / 1000));
  let relative = 'hace un momento';
  if (diffSec >= 3600) {
    const hours = Math.floor(diffSec / 3600);
    relative = `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  } else if (diffSec >= 60) {
    const mins = Math.floor(diffSec / 60);
    relative = `hace ${mins} min`;
  }
  const datePart = `${String(started.getDate()).padStart(2, '0')}/${String(started.getMonth() + 1).padStart(2, '0')}/${started.getFullYear()}`;
  const timePart = started.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return `Sesión iniciada ${datePart}, ${timePart} (${relative})`;
}

export function AdminHeader({
  onMenu,
  open,
}: {
  onMenu: () => void;
  open: boolean;
}) {
  const navigate = useNavigate();
  const { config } = useAdmin();

  const [profileOpen, setProfileOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sessionStartedAt, setSessionStartedAt] =
    useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    authService
      .getEntrepreneurProfile()
      .then(data => setEmail(data.email))
      .catch(() => setEmail(''));
    setSessionStartedAt(authService.getSessionStartedAt());
    setNow(Date.now());
  }, [profileOpen]);
  useEffect(() => {
    if (!profileOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [profileOpen]);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function logout() {
    authService.logout();
    setProfileOpen(false);

    navigate(
      templatePaths[config.template] + '/ingresar',
      { replace: true },
    );
  }

  return (
    <header className="admin-header">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="md:hidden p-2"
          aria-label="Abrir navegación"
          aria-controls="admin-sidebar"
          aria-expanded={open}
          onClick={onMenu}
        >
          <Icon
            name="menu"
            className="w-5 h-5"
          />
        </button>

        <h1 className="text-base md:text-lg font-bold">
          Panel de Administración
        </h1>
      </div>

      <div
        ref={profileRef}
        className="relative"
      >
        <button
          type="button"
          onClick={() =>
            setProfileOpen((current) => !current)
          }
          aria-label="Abrir perfil del emprendedor"
          aria-expanded={profileOpen}
          className="
            w-9 h-9
            rounded-full
            overflow-hidden
            border border-slate-200
            bg-[var(--primary)]
            text-white
            flex items-center
            justify-center
            font-bold
            text-xs
            shadow-[0_1px_2px_rgba(15,23,42,0.08)]
            hover:opacity-90
            transition-opacity
          "
        >
          {config.logo ? (
            <img
              src={config.logo}
              alt={config.name || 'Tienda'}
              className="w-full h-full object-cover"
            />
          ) : (
            (config.name?.trim()?.[0] || 'E').toUpperCase()
          )}
        </button>

        {profileOpen && (
          <div
            className="
              absolute
              right-0
              top-12
              z-50
              w-72
              overflow-hidden
              rounded-xl
              border
              border-[var(--border)]
              bg-white
              shadow-xl
            "
          >
            <div className="px-4 py-3.5 border-b border-[var(--border)]">
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {config.name || 'Mi tienda'}
              </p>

              <p className="mt-0.5 text-xs text-slate-500 break-all">
                {email}
              </p>
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                {formatSessionTime(sessionStartedAt, now)}
              </p>
              <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                Emprendedor
              </span>
            </div>

            <Link to="/emprendedor/perfil" onClick={() => setProfileOpen(false)} className="block px-4 py-3 text-sm text-slate-700 hover:bg-[var(--muted)] transition-colors">Mi cuenta / Perfil</Link>
            <div className="p-2 border-t border-[var(--border)] bg-slate-50/60">
              <button
                type="button"
                onClick={logout}
                className="
                  w-full
                  inline-flex
                  items-center
                  justify-center
                  gap-2
                  rounded-lg
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-2
                  text-xs
                  font-semibold
                  text-slate-700
                  shadow-[0_1px_2px_rgba(15,23,42,0.05)]
                  transition-colors
                  hover:border-red-200
                  hover:bg-red-50
                  hover:text-red-700
                "
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
