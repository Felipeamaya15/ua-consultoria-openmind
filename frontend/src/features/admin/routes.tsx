import { lazyPage } from '../../app/LazyPage';
import EntrepreneurProfile from './pages/Profile';
import { Navigate, useLocation, type RouteObject } from 'react-router-dom';

import { RequireAdmin } from './auth/RequireAdmin';
import { AdminProvider } from './context/AdminContext';
import { AdminLayout } from './components/layout/AdminLayout';

import Dashboard from './pages/Dashboard';
import { ProductList, ProductForm } from './pages/Products';
import Orders from './pages/Orders';
const Sales = lazyPage(() => import('./pages/Sales'));
const Contacts = lazyPage(() => import('./pages/Contacts'));
import Design from './pages/Design';
const ThemeEditor = lazyPage(() => import('./pages/ThemeEditor'));
const Marketing = lazyPage(() => import('../marketing/pages/Marketing'));
import Promotions from './pages/Promotions';
import Payments from './pages/Payments';
import Shipping from './pages/Shipping';
import Authentication from './pages/Authentication';
import Emails from './pages/Emails';
import SeoAnalytics from './pages/SeoAnalytics';
import LandingPage from './pages/LandingPage';
import Legal from './pages/Legal';

function LegacySettingsRedirect() {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: '/emprendedor/landing', search, hash }} state={state} replace />;
}

function ThemeEditorRoute() {
  return (
    <AdminProvider>
      <ThemeEditor />
    </AdminProvider>
  );
}

export const adminRoute: RouteObject = {
  path: '/emprendedor',
  element: <RequireAdmin />,
  children: [
    {
      path: 'diseno/editor',
      element: <ThemeEditorRoute />,
    },
    {
      element: <AdminLayout />,
      children: [
        {
          path: 'perfil',
          element: <EntrepreneurProfile />,
        },
        {
          index: true,
          element: <Dashboard />,
        },
        {
          path: 'productos',
          element: <ProductList />,
        },
        {
          path: 'productos/:id',
          element: <ProductForm />,
        },
        {
          path: 'pedidos',
          element: <Orders />,
        },
        { path: 'ventas', element: <Sales /> },
        { path: 'contactos', element: <Contacts /> },
        {
          path: 'diseno',
          element: <Design />,
        },
        {
          path: 'landing',
          element: <LandingPage />,
        },
        {
          path: 'promociones',
          element: <Promotions />,
        },
        {
          path: 'marketing',
          element: <Marketing />,
        },
        {
          path: 'pagos',
          element: <Payments />,
        },
        {
          path: 'entregas',
          element: <Shipping />,
        },
        {
          path: 'autenticacion',
          element: <Authentication />,
        },
        {
          path: 'correos',
          element: <Emails />,
        },
        {
          path: 'seo',
          element: <SeoAnalytics />,
        },
        {
          path: 'configuracion',
          element: <LegacySettingsRedirect />,
        },
        {
          path: 'legal',
          element: (
            <Navigate
              to="/emprendedor/legal/terminos"
              replace
            />
          ),
        },
        {
          path: 'legal/:type',
          element: <Legal />,
        },
        {
          path: '*',
          element: (
            <Navigate
              to="/emprendedor"
              replace
            />
          ),
        },
      ],
    },
  ],
};
