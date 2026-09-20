export type ApiStatus = {
  ok: boolean;
  status: number | null;
  message: string;
};

const DEFAULT_API_URL = 'http://localhost:8000';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? DEFAULT_API_URL;

export async function checkApiConnection(): Promise<ApiStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me/`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: true,
        status: response.status,
        message: 'Backend disponible. El endpoint requiere autenticacion.',
      };
    }

    return {
      ok: response.ok,
      status: response.status,
      message: response.ok
        ? 'Backend disponible y respondiendo correctamente.'
        : 'Backend respondio, pero con estado inesperado.',
    };
  } catch {
    return {
      ok: false,
      status: null,
      message: 'No se pudo conectar con el backend.',
    };
  }
}
