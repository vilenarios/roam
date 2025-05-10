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
import './styles/app.css'

export function App() {

  const [showAbout, setShowAbout] = useState(false)

  // Consent state: load from localStorage
  const [accepted, setAccepted] = useState<boolean>(() => localStorage.getItem('consent') === 'true')
  const [rejected, setRejected] = useState<boolean>(false)

  const handleAccept = () => {
    localStorage.setItem('consent', 'true')
    setAccepted(true)
  }
  const handleReject = () => {
    setRejected(true)
    window.open('', '_self')
    window.close()
    window.location.href = 'about:blank'
  }

  if (rejected) {
    return null
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
  const [ownerAddress, setOwnerAddress] = useState<string|undefined>(undefined)
  const [queueLoading, setQueueLoading] = useState(false)

  const [media, setMedia]     = useState<Channel['media']>('image')
  const [recency, setRecency] = useState<Channel['recency']>('new')
  const channel: Channel      = { media, recency, ownerAddress}

  // Lock background scroll when details drawer is open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen)
  }, [detailsOpen])

  // Initialize fetch queue on mount
  useEffect(() => {
    setQueueLoading(true)
    initFetchQueue(channel)
      .then(() => logger.info('Fetch queue initialized'))
      .catch((e) => {
        logger.error('Initialization failed', e)
        setError('Initialization error, please refresh.')
      })
      .finally(() => setQueueLoading(false))
      setCurrentTx(null)
  }, [channel.media, channel.recency, ownerAddress])

  const txUrl = currentTx ? `https://arweave.net/${currentTx.id}` : ''

  // Handler for Next button
  const handleNext = async () => {
    setError(null)
    setLoading(true)
    try {
      const tx = await getNextTx(channel)
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
        {/* Text */}
        <button 
          class={media==='text' ? 'active' : ''} 
          onClick={() => setMedia('text')}
        >
          📖 Text
        </button>
      </div>

      <div class="time-picker">
        <button
          class={recency==='new'    ? 'active' : ''}
          onClick={() => setRecency('new')}
        >⏰ New</button>
        <button
          class={recency==='old'    ? 'active' : ''}
          onClick={() => setRecency('old')}
        >🗄️ Old</button>
      </div>

      <div class="controls">
        <SurfButtons
          onNext={handleNext}
          onBack={handleBack}
          disableNext={loading || queueLoading}
          disableBack={!currentTx || loading}
        />
      </div>

      {ownerAddress && (
          <button
            class="clear-filter"
            onClick={() => {
              setOwnerAddress(undefined)
              setCurrentTx(null)
            }}
          >
            ✖️ Show everyone
          </button>
      )}

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
              <button
                class="fab owner-fab"
                onClick={() => setOwnerAddress(currentTx.owner.address)}
                title="More from this owner"
              >
                👤
              </button>
            </div>
          </>
        )}
      </main>
      <DetailsDrawer
        txMeta={currentTx}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
      <footer className="app-footer">
      <nav>
            <a
              href="#"
              className="footer-link"
              onClick={(e) => {
                e.preventDefault()
                setShowAbout(true)
              }}   
            > About </a>
          <span className="footer-separator">·</span>
          <a href="https://github.com/your-repo" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </nav>
      <div className="footer-copy">ⓐ {new Date().getFullYear()} Surf the Permaweb</div>
    </footer>
      {/* About Modal */}
        {showAbout && (
          <div className="about-modal">
            <div className="modal-backdrop" onClick={() => setShowAbout(false)} />
            <div className="modal-content">
              <h2>About Surf the Permaweb</h2>
              <p>
                Welcome to Surf the Permaweb! 🌊🏄🌊
                <br />
                This playful app lets you randomly explore Arweave content:
                images, music, videos, websites, and even text documents.
                Just pick a channel, choose New or Old, and click Next to
                catch your next data wave. Filter by creator, dive deep into
                history, or share those hidden gems!
              </p>
              <button className="modal-close-btn" onClick={() => setShowAbout(false)}>
                Close
              </button>
            </div>
          </div>
      )}
    </div>
  )
}