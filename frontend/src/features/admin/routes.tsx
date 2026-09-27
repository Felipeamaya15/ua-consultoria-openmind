import { Navigate, type RouteObject } from 'react-router-dom';

import { RequireAdmin } from './auth/RequireAdmin';
import { AdminProvider } from './context/AdminContext';
import { AdminLayout } from './components/layout/AdminLayout';

import Dashboard from './pages/Dashboard';
import { ProductList, ProductForm } from './pages/Products';
import Orders from './pages/Orders';
import Design from './pages/Design';
import ThemeEditor from './pages/ThemeEditor';
import LandingPage from './pages/LandingPage';
import Promotions from './pages/Promotions';
import Payments from './pages/Payments';
import Shipping from './pages/Shipping';
import Authentication from './pages/Authentication';
import Emails from './pages/Emails';
import SeoAnalytics from './pages/SeoAnalytics';
import Settings from './pages/Settings';
import Legal from './pages/Legal';

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
          element: <Settings />,
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
