// src/components/ZoomOverlay.tsx
import '../styles/zoom-overlay.css';

export function ZoomOverlay({ src, onClose }: { src: string; onClose(): void }) {
  return (
    <div className="zoom-overlay">
      <button className="zoom-close-btn" onClick={onClose} aria-label="Close zoom view">
        ✖️
      </button>
      <div className="zoom-scroll-container">
        <img src={src} alt="Zoomed media" className="zoomed-img" />
      </div>
    </div>
  );
}

