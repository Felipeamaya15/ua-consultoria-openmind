export interface InitialLoadOptions {
  signal?: AbortSignal;
  retry?: boolean;
}

const retryDelays = [750, 1000, 1500];
const abortError = () => new DOMException('Carga cancelada', 'AbortError');

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

// Solo GET iniciales que habilitan explícitamente retry. Nunca reintenta un guardado.
export async function fetchInitialLoad(url: string, options: InitialLoadOptions = {}): Promise<Response> {
  const { signal, retry = false } = options;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      const response = await fetch(url, { signal });
      const temporary = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retry || !temporary || attempt >= retryDelays.length) return response;
      await response.body?.cancel();
    } catch (error) {
      if (signal?.aborted || !retry || !(error instanceof TypeError) || attempt >= retryDelays.length) throw error;
    }
    await waitForRetry(retryDelays[attempt], signal);
  }
}
