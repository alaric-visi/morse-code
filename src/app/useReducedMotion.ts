import { useEffect, useState } from 'preact/hooks';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the system asks for reduced motion; follows changes live. */
export function useReducedMotion(): boolean {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(QUERY) : undefined;
  const [reduced, setReduced] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
