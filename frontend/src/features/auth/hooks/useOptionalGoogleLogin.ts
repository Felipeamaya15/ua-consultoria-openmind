import { useGoogleLogin } from '@react-oauth/google';

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const GOOGLE_LOGIN_CONFIGURED = Boolean(GOOGLE_CLIENT_ID);

// La configuración de Vite es constante durante la vida de la aplicación.
// Sin client_id no se inicializa el SDK; los otros métodos siguen disponibles.
export const useOptionalGoogleLogin: typeof useGoogleLogin = GOOGLE_LOGIN_CONFIGURED
  ? useGoogleLogin
  : (() => () => undefined) as typeof useGoogleLogin;
