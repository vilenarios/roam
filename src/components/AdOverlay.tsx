// src/components/AdOverlay.tsx
import { useState, useEffect } from 'preact/hooks';
import '../styles/ad-overlay.css'; // see CSS below
import { ADVERTIZEMENT_TIMER } from '../constants';

interface AdOverlayProps {
  src: string;
  onClose: () => void;
}

export const AdOverlay = ({ src, onClose }: AdOverlayProps) => {
  const [timer, setTimer] = useState(ADVERTIZEMENT_TIMER);

  // countdown
  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  return (
    <div className="ad-overlay">
      <img src={src} alt="Sponsored content" className="ad-image" />
      <button
        className="ad-close-btn"
        disabled={timer > 0}
        onClick={onClose}
      >
        {timer > 0 ? `Please wait ${timer}s…` : 'Continue'}
      </button>
    </div>
  );
};
