import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { endDemoSession } from '../../auth/demoSession';
import { DEMO_CREDENTIALS } from '../../config/demoCredentials';
import { useAdmin } from '../../context/AdminContext';
import { templatePaths } from '../../config/navigation';
import { Icon } from '../ui';

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
    endDemoSession();
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
            w-8 h-8
            rounded-full
            bg-[var(--primary)]
            text-white
            flex items-center
            justify-center
            font-bold
            text-xs
            hover:opacity-85
            transition-opacity
          "
        >
          E
        </button>

        {profileOpen && (
          <div
            className="
              absolute
              right-0
              top-11
              z-50
              w-64
              overflow-hidden
              rounded-xl
              border
              border-[var(--border)]
              bg-white
              shadow-xl
            "
          >
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-sm font-semibold">
                Emprendedor
              </p>

              <p className="mt-0.5 text-xs text-[var(--muted-foreground)] break-all">
                {DEMO_CREDENTIALS.email}
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="
                w-full
                px-4 py-3
                text-left
                text-sm
                font-medium
                hover:bg-[var(--muted)]
                transition-colors
                flex
                items-center
                gap-2
              "
            >
              <span aria-hidden="true">↪</span>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
