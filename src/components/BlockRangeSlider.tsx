// src/components/BlockRangeSlider.tsx
import { useRef, useEffect } from 'preact/hooks';

type BlockRange = { min: number; max: number };

type Props = {
  tempRange: BlockRange;
  setTempRange: (r: BlockRange) => void;
  chainTip: number;
};

export function BlockRangeSlider({ tempRange, setTempRange, chainTip }: Props) {
  const minInput = useRef<HTMLInputElement>(null);
  const maxInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!minInput.current || !maxInput.current) return;

      const active = document.activeElement;
      const isMin = active === minInput.current;
      const isMax = active === maxInput.current;

      if (isMin || isMax) {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (delta === 0) return;

        if (isMin) {
        const newMin = Math.min(tempRange.min + delta, tempRange.max - 1);
        setTempRange({ ...tempRange, min: Math.max(1, newMin) });
        }

        if (isMax) {
        const newMax = Math.max(tempRange.max + delta, tempRange.min + 1);
        setTempRange({ ...tempRange, max: Math.min(chainTip, newMax) });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tempRange, chainTip]);

    const handleMinChange = (val: number) => {
    const clamped = Math.min(val, tempRange.max - 1); // cannot equal or exceed max
    setTempRange({ ...tempRange, min: Math.max(1, clamped) });
    };

    const handleMaxChange = (val: number) => {
    const clamped = Math.max(val, tempRange.min + 1); // cannot equal or drop below min
    setTempRange({ ...tempRange, max: Math.min(chainTip, clamped) });
    };

  const minPercent = (tempRange.min / chainTip) * 100;
  const maxPercent = (tempRange.max / chainTip) * 100;

  return (
    <div className="block-slider">
      <label className="slider-label">Block Range</label>
      <div className="slider-track-wrapper">
        <div className="slider-track">
          <div
            className="slider-fill"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
        </div>
        <input
          type="range"
          ref={minInput}
          className="slider-thumb"
          min={1}
          max={chainTip}
          value={tempRange.min}
          onInput={(e) => handleMinChange(Number((e.target as HTMLInputElement).value))}
          aria-label="Minimum block"
        />
        <input
          type="range"
          ref={maxInput}
          className="slider-thumb"
          min={1}
          max={chainTip}
          value={tempRange.max}
          onInput={(e) => handleMaxChange(Number((e.target as HTMLInputElement).value))}
          aria-label="Maximum block"
        />
      </div>
      <div className="slider-labels">
        <span>{tempRange.min}</span>
        <span>{tempRange.max}</span>
      </div>
    </div>
  );
}
