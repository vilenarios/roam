// src/components/SurfButtons.tsx
import { useEffect } from 'preact/hooks'
import { logger } from '../utils/logger'

export interface SurfButtonsProps {
  onNext: () => Promise<void>
  onBack: () => Promise<void>
  disableNext?: boolean
  disableBack?: boolean
}

/**
 * Renders Back / Next buttons and binds:
 * - Spacebar → Next
 * - ArrowLeft → Back
 */
export const SurfButtons = ({
  onNext,
  onBack,
  disableNext = false,
  disableBack = false,
}: SurfButtonsProps) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // ignore if typing in inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as Element).tagName)) return

      if (e.code === 'Space') {
        e.preventDefault()
        if (!disableNext) onNext().catch(err => logger.error('KeyNav Next failed', err))
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        if (!disableBack) onBack().catch(err => logger.error('KeyNav Back failed', err))
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onNext, onBack, disableNext, disableBack])

  return (
    <div class="controls">
      <button
        class="back-btn"
        onClick={() => onBack().catch(err => logger.error('Click Back failed', err))}
        disabled={disableBack}
      >
        ← Back
      </button>
      <button
        class="next-btn"
        onClick={() => onNext().catch(err => logger.error('Click Next failed', err))}
        disabled={disableNext}
      >
        Next →
      </button>
    </div>
  )
}
