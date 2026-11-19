import { useGoogleLogin } from '@react-oauth/google';

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const GOOGLE_LOGIN_CONFIGURED = Boolean(GOOGLE_CLIENT_ID);


export const useOptionalGoogleLogin: typeof useGoogleLogin = GOOGLE_LOGIN_CONFIGURED
  ? useGoogleLogin
  : (() => () => undefined) as typeof useGoogleLogin;
