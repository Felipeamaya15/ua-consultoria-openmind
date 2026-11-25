const TECHNICAL_ERROR = /backend|frontend|\bapi\b|endpoint|request|response|payload|\bjson\b|\btoken\b|base de datos|traceback|resolver[_\s]|TypeError|SyntaxError|NetworkError|IntegrityError|ProgrammingError|\bHTTP\b|\b(?:invalid|undefined|null|exception|connection|ECONNREFUSED)\b|failed to fetch|network error|unexpected|\([45]\d\d\)|\berror\s+[45]\d\d\b|^\s*[\[{<]|\b(?:select|insert|update)\s+\w+\s+(?:from|into|set)\b/i;
export function humanizeAdminError(message: unknown, fallback = 'No pudimos completar esta acción. Intenta nuevamente.'): string {
  if (typeof message !== 'string' || !message.trim() || message.length > 500 || TECHNICAL_ERROR.test(message) || SENSITIVE_ERROR.test(message)) return fallback;
  return message.trim();
}
const SENSITIVE_ERROR = /password|secret|token|credential|credencial|api[_\s-]?key|access[_\s-]?key|bearer\s|enc::|sk-[a-z0-9]|clave[_\s]*(?:privada|secreta)|(?:clave|contraseña|authorization|cookie)\s*[:=]|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/|https?:\/\/|(?:[a-z]:[\\/]|\/(?:home|app|srv|var|usr|etc|opt|tmp)\/)|(?:file\s+['"]|line\s+\d+)|eyJ[a-z0-9_-]+\.|[a-z0-9_+\/-]{48,}/i;
