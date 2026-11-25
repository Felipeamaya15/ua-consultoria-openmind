import { FeedbackProvider } from './shared/components/FeedbackProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID, GOOGLE_LOGIN_CONFIGURED } from './features/auth/hooks/useOptionalGoogleLogin';
import { router } from './app/router';
import { StoreIdentityProvider } from './features/storefront/context/StoreIdentityContext';
import './styles/storefront.css';

const application = <FeedbackProvider><StoreIdentityProvider><RouterProvider router={router} /></StoreIdentityProvider></FeedbackProvider>;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {GOOGLE_LOGIN_CONFIGURED
      ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{application}</GoogleOAuthProvider>
      : application}
  </React.StrictMode>
);
