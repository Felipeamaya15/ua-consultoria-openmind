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


export function openAdminWindow(path: string): void {
  const newWindow = window.open('', '_blank');

  if (!newWindow) {


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
