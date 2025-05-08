// src/App.tsx
import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { initFetchQueue, getNextTxId } from './engine/fetchQueue'
import { addHistory, goBack } from './engine/history'
import { MediaView } from './components/MediaView'
import { logger } from './utils/logger'
import { SurfButtons } from './components/SurfButtons'
import './app.css'

// Default channel for MVP
const defaultChannel = { media: 'image', recency: 'recent' } as const

export function App() {
  const [txId, setTxId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize fetch queue on mount
  useEffect(() => {
    initFetchQueue(defaultChannel)
      .then(() => logger.info('Fetch queue initialized'))
      .catch((e) => {
        logger.error('Initialization failed', e)
        setError('Initialization error, please refresh.')
      })
  }, [])

  // Handler for Next button
  const handleNext = async () => {
    setError(null)
    setLoading(true)
    try {
      const id = await getNextTxId(defaultChannel)
      await addHistory(id)
      setTxId(id)
    } catch (e) {
      logger.error('Error fetching next item', e)
      setError('Failed to load next content.')
    } finally {
      setLoading(false)
    }
  }

  // Handler for Back button
  const handleBack = async () => {
    setError(null)
    setLoading(true)
    try {
      const prev = await goBack()
      if (prev) {
        setTxId(prev)
      } else {
        setError('No previous content.')
      }
    } catch (e) {
      logger.error('Error navigating back', e)
      setError('Failed to go back.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="app">
      <header>
        <h1>Surf the Permaweb</h1>
      </header>

      <div class="controls">
      <SurfButtons
        onNext={handleNext}
        onBack={handleBack}
        disableNext={loading}
        disableBack={!txId || loading}
      />
      </div>

      {error && <div class="error">{error}</div>}

      <main class="media-container">
        {loading && <div class="loading">Loading…</div>}
        {!txId && !loading && <div class="placeholder">Tap “Next” to start surfing!</div>}
        {txId && !loading && <MediaView txId={txId} />}
      </main>
    </div>
  )
}
