import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { router } from './app/router';
import { StoreIdentityProvider } from './features/storefront/context/StoreIdentityContext';
import './styles/storefront.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <StoreIdentityProvider><RouterProvider router={router} /></StoreIdentityProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
