const TECHNICAL_ERROR = /backend|frontend|\bapi\b|endpoint|request|response|payload|\bjson\b|\btoken\b|base de datos|traceback|resolver[_\s]|TypeError|SyntaxError|NetworkError|IntegrityError|ProgrammingError|\bHTTP\b|\b(?:invalid|undefined|null|exception|connection|ECONNREFUSED)\b|failed to fetch|network error|unexpected|\([45]\d\d\)|\berror\s+[45]\d\d\b|^\s*[\[{<]|\b(?:select|insert|update)\s+\w+\s+(?:from|into|set)\b/i;
export function humanizeAdminError(message: unknown, fallback = 'No pudimos completar esta acción. Intenta nuevamente.'): string {
  if (typeof message !== 'string' || !message.trim() || TECHNICAL_ERROR.test(message)) return fallback;
  return message;
}
