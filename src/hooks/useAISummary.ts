import { useState, useCallback, useRef } from 'react';

export function useAISummary() {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const requestGenRef = useRef(0);

  const resetSummary = useCallback(() => {
    setSummary('');
    setError('');
  }, []);

  const runSummary = useCallback(async (jobId: string, text: string) => {
    const gen = ++requestGenRef.current;
    setSummary('');
    setError('');
    setIsLoading(true);

    const finish = () => {
      if (requestGenRef.current === gen) {
        setIsLoading(false);
      }
    };

    try {
      const res = await fetch('/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, text }),
      });

      if (requestGenRef.current !== gen) {
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('El cuerpo de la respuesta no es legible como stream');
      }

      const decoder = new TextDecoder();
      let receivedAny = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          receivedAny = true;
          if (requestGenRef.current === gen) {
            setSummary((prev) => prev + chunk);
          }
        }
      }
      const tail = decoder.decode();
      if (tail) {
        receivedAny = true;
        if (requestGenRef.current === gen) {
          setSummary((prev) => prev + tail);
        }
      }

      if (requestGenRef.current === gen && !receivedAny) {
        setError(
          'El servidor no devolvió ningún texto. Revisá en Vercel: AI_GATEWAY_API_KEY (o despliegue con OIDC), variable AI_GATEWAY_MODEL y los logs de la función /ai/summary.'
        );
      }
    } catch (e: unknown) {
      if (requestGenRef.current !== gen) {
        return;
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      const message = e instanceof Error ? e.message : 'Error desconocido';
      setError(message);
    } finally {
      finish();
    }
  }, []);

  return { summary, isLoading, error, resetSummary, runSummary };
}
