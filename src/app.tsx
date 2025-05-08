// src/App.tsx
import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { initFetchQueue, getNextTx } from './engine/fetchQueue'
import { addHistory, goBack } from './engine/history'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { SurfButtons } from './components/SurfButtons'
import { logger } from './utils/logger'
import type { Channel, TxMeta } from './engine/query'
import './app.css'

// Default channel for MVP
const defaultChannel = { media: 'image', recency: 'recent' } as const

export function App() {

  // Consent state: load from localStorage
  const [accepted, setAccepted] = useState<boolean>(() => localStorage.getItem('consent') === 'true')
  const [rejected, setRejected] = useState<boolean>(false)

  const handleAccept = () => {
    localStorage.setItem('consent', 'true')
    setAccepted(true)
  }
  const handleReject = () => {
    setRejected(true)
  }

  // If not yet accepted, show consent modal
  if (!accepted && !rejected) {
    return (
      <div className="consent-backdrop">
        <div className="consent-modal">
          <h2>⚠️ Content Warning</h2>
          <p>This app will show anything posted to Arweave—some of it may be sensitive or NSFW. You must be 18+ to continue.</p>
          <div className="consent-actions">
            <button className="consent-btn accept" onClick={handleAccept}>I accept, continue</button>
            <button className="consent-btn reject" onClick={handleReject}>Close app</button>
          </div>
        </div>
      </div>
    )
  }

  const [currentTx, setCurrentTx] = useState<TxMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [media, setMedia]     = useState<Channel['media']>('image')
  const [recency, setRecency] = useState<Channel['recency']>('recent')
  const channel: Channel      = { media, recency }

  // Lock background scroll when details drawer is open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen)
  }, [detailsOpen])

  // Initialize fetch queue on mount
  useEffect(() => {
    initFetchQueue(channel)
      .then(() => logger.info('Fetch queue initialized'))
      .catch((e) => {
        logger.error('Initialization failed', e)
        setError('Initialization error, please refresh.')
      })
      setCurrentTx(null)
  }, [channel.media, channel.recency])

  const txUrl = currentTx ? `https://arweave.net/${currentTx.id}` : ''

  // Handler for Next button
  const handleNext = async () => {
    setError(null)
    setLoading(true)
    try {
      const tx = await getNextTx(defaultChannel)
      await addHistory(tx)
      setCurrentTx(tx)
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
        setCurrentTx(prev)
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

  // Share button logic
  const handleShare = async () => {
    if (!txUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Surf the Permaweb',
          text: 'Check out this permaweb transaction!',
          url: txUrl,
        })
      } catch (err) {
        logger.error('Share API failed', err)
      }
    } else {
      try {
        await navigator.clipboard.writeText(txUrl)
        logger.info('Link copied to clipboard')
        alert('Link copied to clipboard!')
      } catch (err) {
        logger.error('Clipboard write failed', err)
      }
    }
  }

  // Preview button opens raw tx
  const handlePreview = () => {
    if (txUrl) window.open(txUrl, '_blank')
  }

  return (
    <div class="app">
      <header><h1>Surf the Permaweb</h1></header>

      <div class="channel-picker">
        {/* Images */}
        <button
          class={media==='image' ? 'active' : ''}
          onClick={() => setMedia('image')}
        >
          🖼 Images
        </button>

        {/* Music */}
        <button
          class={media==='music' ? 'active' : ''}
          onClick={() => setMedia('music')}
        >
          🎵 Music
        </button>

        {/* Movies */}
        <button
          class={media==='video' ? 'active' : ''}
          onClick={() => setMedia('video')}
        >
          🎬 Movies
        </button>

        {/* Websites */}
        <button
          class={media==='website' ? 'active' : ''}
          onClick={() => setMedia('website')}
        >
          🌐 Websites
        </button>
      </div>

      <div class="time-picker">
        <button
          class={recency==='new'    ? 'active' : ''}
          onClick={() => setRecency('new')}
        >⏰ New</button>
        <button
          class={recency==='recent' ? 'active' : ''}
          onClick={() => setRecency('recent')}
        >🕒 Recent</button>
        <button
          class={recency==='old'    ? 'active' : ''}
          onClick={() => setRecency('old')}
        >🗄️ Old</button>
      </div>

      <div class="controls">
        <SurfButtons
          onNext={handleNext}
          onBack={handleBack}
          disableNext={loading}
          disableBack={!currentTx || loading}
        />
      </div>

      {error && <div class="error">{error}</div>}

      <main class="media-container">
        {loading && <div class="loading">Loading…</div>}
        {!currentTx && !loading && (
          <div class="placeholder">Tap “Next” to start surfing!</div>
        )}
        {currentTx && !loading && (
          <>
            <MediaView txMeta={currentTx} />
            <div class="media-actions">
              <button class="share-btn" onClick={handleShare}>Share</button>
              <button class="details-btn" onClick={() => setDetailsOpen(true)}>Details</button>
              <button class="preview-btn" onClick={handlePreview}>Preview</button>
            </div>
          </>
        )}
      </main>

      <DetailsDrawer
        txMeta={currentTx}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  )
}