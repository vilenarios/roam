// src/components/Interstitial.tsx
import { useState, useEffect } from 'preact/hooks';
import '../styles/Interstitial.css';
import { ADVERTIZEMENT_TIMER } from '../constants';

interface InterstitialProps {
  src: string;
  onClose: () => void;
}

export const Interstitial = ({ src, onClose }: InterstitialProps) => {
  const [timer, setTimer] = useState(ADVERTIZEMENT_TIMER);

  // countdown
  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  return (
    <div className="interstitial-overlay">
      <img src={src} alt="Sponsored content" className="interstitial-image" />
      <button
        className="interstitial-close-btn"
        disabled={timer > 0}
        onClick={onClose}
      >
        {timer > 0 ? `Please wait ${timer}s…` : 'Continue'}
      </button>
    </div>
  );
};
