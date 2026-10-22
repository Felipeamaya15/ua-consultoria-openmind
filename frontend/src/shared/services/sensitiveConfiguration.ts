const privateKeys = new Set(['apikey', 'claveprivada', 'accesstoken', 'clientsecret', 'secretkey', 'password', 'privatekey']);

/** Las credenciales escritas en un formulario solo viajan al servidor; nunca a la caché de diseño. */
export function withoutPrivateCredentials<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutPrivateCredentials) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.has(key.replace(/[_-]/g, '').toLowerCase()))
    .map(([key, item]) => [key, withoutPrivateCredentials(item)])) as T;
}
