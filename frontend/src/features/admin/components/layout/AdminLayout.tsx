import {
  useEffect,
  useState,
} from 'react';
import {
  Outlet,
  useLocation,
} from 'react-router-dom';

import {
  AdminProvider,
  useAdmin,
} from '../../context/AdminContext';

import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { Alert } from '../ui';

import '../../admin.css';

function Layout() {
  const [open, setOpen] = useState(false);

  const { pathname } = useLocation();

  const { storageError } = useAdmin();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const listener = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener(
      'keydown',
      listener,
    );

    return () =>
      document.removeEventListener(
        'keydown',
        listener,
      );
  }, [open]);

  return (
    <div className="admin-shell">
      <AdminSidebar
        open={open}
        onClose={() => setOpen(false)}
      />

      <div className="admin-content">
        <AdminHeader
          open={open}
          onMenu={() => setOpen(!open)}
        />

        <main className="p-5 md:p-8 max-w-7xl w-full mx-auto">
          {storageError && (
            <div className="mb-5">
              <Alert variant="error">
                {storageError}
              </Alert>
            </div>
          )}

          <Outlet key={pathname} />
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminProvider>
      <Layout />
    </AdminProvider>
  );
}
