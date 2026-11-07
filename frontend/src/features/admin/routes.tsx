import { lazyPage } from '../../app/LazyPage';
import EntrepreneurProfile from './pages/Profile';
import { Navigate, useLocation, type RouteObject } from 'react-router-dom';

import { RequireAdmin } from './auth/RequireAdmin';
import { AdminProvider } from './context/AdminContext';
import { AdminLayout } from './components/layout/AdminLayout';

const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const ProductList = lazyPage(() => import('./pages/Products').then(module => ({default:module.ProductList})));
const ProductForm = lazyPage(() => import('./pages/Products').then(module => ({default:module.ProductForm})));
const Orders = lazyPage(() => import('./pages/Orders'));
const Sales = lazyPage(() => import('./pages/Sales'));
const Contacts = lazyPage(() => import('./pages/Contacts'));
const Activities = lazyPage(() => import('./pages/Activities'));
const Design = lazyPage(() => import('./pages/Design'));
const ThemeEditor = lazyPage(() => import('./pages/ThemeEditor'));
const Marketing = lazyPage(() => import('../marketing/pages/Marketing'));
const Promotions = lazyPage(() => import('./pages/Promotions'));
const Payments = lazyPage(() => import('./pages/Payments'));
const Shipping = lazyPage(() => import('./pages/Shipping'));
const Authentication = lazyPage(() => import('./pages/Authentication'));
const Emails = lazyPage(() => import('./pages/Emails'));
const SeoAnalytics = lazyPage(() => import('./pages/SeoAnalytics'));
const LandingPage = lazyPage(() => import('./pages/LandingPage'));
const Legal = lazyPage(() => import('./pages/Legal'));

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
        { path: 'actividades', element: <Activities /> },
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
