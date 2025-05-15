// src/hooks/useAdInjector.ts
import { useState, useCallback } from 'preact/hooks';

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function useInterstitialInjector(minClicks = 25, maxClicks = 30) {
  const [count, setCount]       = useState(0);
  const [threshold, setThreshold] = useState(() => randomBetween(minClicks, maxClicks));

  const recordClick = useCallback(() => {
    setCount(c => c + 1);
  }, []);

  const shouldShowInterstitial = count >= threshold;

  const reset = useCallback(() => {
    setCount(0);
    // **re‐randomize** for the next cycle
    setThreshold(randomBetween(minClicks, maxClicks));
  }, [minClicks, maxClicks]);

  return { recordClick, shouldShowInterstitial, reset };
}
