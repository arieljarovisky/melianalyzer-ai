import { useState, useCallback } from 'react';

export function useAISummary() {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const resetSummary = useCallback(() => {
    setSummary('');
    setError('');
  }, []);

  const runSummary = useCallback(async (jobId: string, text: string) => {
    setSummary('');
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, text }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('El cuerpo de la respuesta no es legible como stream');
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setSummary((prev) => prev + chunk);
        }
      }
      const tail = decoder.decode();
      if (tail) {
        setSummary((prev) => prev + tail);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error desconocido';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { summary, isLoading, error, resetSummary, runSummary };
}
