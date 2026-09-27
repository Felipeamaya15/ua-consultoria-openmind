import {
  DEMO_CREDENTIALS,
  DEMO_SESSION_KEY,
} from '../config/demoCredentials';

export function hasDemoSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function matchesDemoCredentials(
  email: string,
  password: string,
): boolean {
  return (
    email.trim().toLowerCase() === DEMO_CREDENTIALS.email &&
    password === DEMO_CREDENTIALS.password
  );
}

export function startDemoSession(): void {
  sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
}

export function endDemoSession(): void {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
}

/**
 * Abre una ruta administrativa en una pestaña nueva manteniendo
 * la sesión demo exclusivamente en sessionStorage.
 *
 * Se abre primero una ventana same-origin vacía, se copia allí la
 * sesión y recién después se navega hacia la ruta solicitada.
 */
export function openAdminWindow(path: string): void {
  const newWindow = window.open('', '_blank');

  if (!newWindow) {
    // Si el navegador bloquea popups, mantenemos la navegación
    // en la pestaña actual en lugar de dejar el botón sin efecto.
    window.location.assign(path);
    return;
  }

  try {
    newWindow.sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
    newWindow.location.href = path;
  } catch {
    newWindow.close();
    window.location.assign(path);
  }
}
