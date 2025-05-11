// src/hooks/useAdInjector.ts
import { useState, useCallback } from 'preact/hooks';

export function useAdInjector(minClicks = 3, maxClicks = 7) {
  const [count, setCount]       = useState(0);
  const [threshold]            = useState(() =>
    Math.floor(Math.random() * (maxClicks - minClicks + 1)) + minClicks
  );

  const recordClick = useCallback(() => setCount(c => c + 1), []);
  const shouldShowAd = count >= threshold;
  const reset = useCallback(() => setCount(0), []);

  return { recordClick, shouldShowAd, reset };
}
