import { adminRoute } from '../../features/admin/routes';
import {
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';

import { EditorialLayout } from '../../features/storefront/components/store/EditorialLayout';
import { MinimalLayout } from '../../features/storefront/components/store/minimal/MinimalLayout';
import { VisualLayout } from '../../features/storefront/components/store/visual/VisualLayout';
import { CatalogLayout } from '../../features/storefront/components/store/catalog/CatalogLayout';

import EditorialHome from '../../features/storefront/pages/EditorialHome';
import MinimalHome from '../../features/storefront/pages/MinimalHome';
import VisualHome from '../../features/storefront/pages/VisualHome';
import VisualStory from '../../features/storefront/pages/VisualStory';
import CatalogHome from '../../features/storefront/pages/CatalogHome';

import Catalog from '../../features/storefront/pages/Catalog';
import ProductDetail from '../../features/storefront/pages/ProductDetail';
import Cart from '../../features/storefront/pages/Cart';
import Checkout from '../../features/storefront/pages/Checkout';
import OrderConfirmation from '../../features/storefront/pages/OrderConfirmation';
import Tracking from '../../features/storefront/pages/Tracking';
import Login from '../../features/storefront/pages/Login';
import Legal from '../../features/storefront/pages/Legal';

import { PendingPage } from '../../features/storefront/pages/PreviewPages';

import { StoreProvider } from '../../features/storefront/context/StoreContext';
import { CartProvider } from '../../features/storefront/context/CartContext';
import { OrderProvider } from '../../features/storefront/context/OrderContext';

function StorefrontProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <CartProvider>
        <OrderProvider>
          {children}
        </OrderProvider>
      </CartProvider>
    </StoreProvider>
  );
}

const sharedChildren = [
  {
    path: 'catalogo',
    element: <Catalog />,
  },
  {
    path: 'producto/:id',
    element: <ProductDetail />,
  },
  {
    path: 'carrito',
    element: <Cart />,
  },
  {
    path: 'compra',
    element: <Checkout />,
  },
  {
    path: 'pedido-confirmado',
    element: <OrderConfirmation />,
  },
  {
    path: 'seguimiento',
    element: <Tracking />,
  },
  {
    path: 'ingresar',
    element: <Login />,
  },
  {
    path: 'legal/:type',
    element: <Legal />,
  },
  {
    path: '*',
    element: <PendingPage title="Página no encontrada" />,
  },
];

export const router = createBrowserRouter([
  adminRoute,
  /*
   * ==========================================================
   * INICIO
   * ==========================================================
   */
  {
    path: '/',
    element: <Navigate to="/plantilla/1" replace />,
  },

  /*
   * ==========================================================
   * PLANTILLA 1 — EDITORIAL
   * ==========================================================
   */
  {
    path: '/plantilla/1',
    element: (
      <StorefrontProviders>
        <EditorialLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <EditorialHome />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 2 — MINIMAL
   * ==========================================================
   */
  {
    path: '/plantilla/2',
    element: (
      <StorefrontProviders>
        <MinimalLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <MinimalHome />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 3 — VISUAL / VELTA
   * ==========================================================
   */
  {
    path: '/plantilla/3',
    element: (
      <StorefrontProviders>
        <VisualLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <VisualHome />,
      },
      {
        path: 'nuestra-historia',
        element: <VisualStory />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG
   * ==========================================================
   */
  {
    path: '/plantilla/4',
    element: (
      <StorefrontProviders>
        <CatalogLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <CatalogHome />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * RUTAS ANTIGUAS
   * ==========================================================
   */
  {
    path: '/home',
    element: <Navigate to="/plantilla/1" replace />,
  },
  {
    path: '/catalogo',
    element: <Navigate to="/plantilla/1/catalogo" replace />,
  },
  {
    path: '/carrito',
    element: <Navigate to="/plantilla/1/carrito" replace />,
  },
  {
    path: '/seguimiento',
    element: <Navigate to="/plantilla/1/seguimiento" replace />,
  },
  {
    path: '/ingresar',
    element: <Navigate to="/plantilla/1/ingresar" replace />,
  },

  /*
   * ==========================================================
   * FALLBACK
   * ==========================================================
   */
  {
    path: '*',
    element: <Navigate to="/plantilla/1" replace />,
  },
]);