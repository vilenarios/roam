// src/App.tsx
import { useState, useEffect } from 'preact/hooks'
import { initFetchQueue, getNextTx, GATEWAY_DATA_SOURCE } from './engine/fetchQueue'
import { addHistory, goBack } from './engine/history'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { logger } from './utils/logger'
import './styles/app.css'
import './styles/channels-drawer.css'
import { useAdInjector } from './hooks/useAdInjector'
import { AdOverlay } from './components/AdOverlay'
import { MAX_AD_CLICKS, MIN_AD_CLICKS, type Channel, type TxMeta } from './constants'
import { ZoomOverlay } from './components/ZoomOverlay'

export function App() {
  const [showAbout, setShowAbout] = useState(false)

  // Consent state
  const [accepted, setAccepted] = useState(() => localStorage.getItem('consent') === 'true')
  const [rejected, setRejected] = useState(false)
  const handleAccept = () => { localStorage.setItem('consent','true'); setAccepted(true) }
  const handleReject = () => {
    setRejected(true)
    window.open('','_self'); window.close(); window.location.href='about:blank'
  }
  if (rejected) return null
  if (!accepted) return (
    <div className="consent-backdrop">
      <div className="consent-modal">
        <h2>⚠️ Content Warning</h2>
        <p>This app will show anything posted to Arweave - some of it may be sensitive or NSFW. Click at your own risk! You must be 18+ to continue.</p>
        <div className="consent-actions">
          <button className="consent-btn accept" onClick={handleAccept}>I accept</button>
          <button className="consent-btn reject" onClick={handleReject}>Close app</button>
        </div>
      </div>
    </div>
  )

  // Privacy toggle
  const [privacyOn, setPrivacyOn] = useState(true)
  const togglePrivacy = () => setPrivacyOn(p=>!p)

  // Main state
  const [currentTx, setCurrentTx] = useState<TxMeta|null>(null)
  const [loading, setLoading] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string|null>(null);
  const [queueLoading, setQueueLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [ownerAddress, setOwnerAddress] = useState<string|undefined>()

  const { recordClick, shouldShowAd, reset } = useAdInjector(MIN_AD_CLICKS, MAX_AD_CLICKS);
  const [showAd, setShowAd] = useState(false);
  const handleCloseAd = () => {
    setShowAd(false);
    reset();
    // after ad, go to next
    handleNext();
  };

  // Channel & time
  const [media, setMedia] = useState<Channel['media']>('anything')
  const [recency, setRecency] = useState<Channel['recency']>('old')
  const channel: Channel = { media, recency, ownerAddress }

  // Channels drawer
  const [showChannels, setShowChannels] = useState(false)
  const openChannels = () => setShowChannels(true)
  const closeChannels = () => setShowChannels(false)

  // lock scroll when drawers open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen||showChannels)
  }, [detailsOpen, showChannels])

  // fetch queue on channel change
  useEffect(() => {
    setQueueLoading(true)
    setCurrentTx(null)
    initFetchQueue(channel)
      .then(()=>logger.info('Fetch queue initialized'))
      .catch(e=>{ logger.error('Init failed',e); setError('Init error') })
      .finally(()=>setQueueLoading(false))
  }, [media, recency, ownerAddress])

  const txUrl = currentTx ? `${GATEWAY_DATA_SOURCE[0]}/${currentTx.id}` : ''
  const formattedTime = currentTx
    ? new Date(currentTx.block.timestamp * 1000).toLocaleString(undefined, {
        year:   'numeric',
        month:  'short',
        day:    'numeric',
      })
    : ''

  // Next/Back handlers
  const handleNext = async ()=>{
    setError(null);
    setLoading(true)
    recordClick();  // count this click
    if (shouldShowAd) {
      setShowAd(true);
      setLoading(false);
      return;
    }
    try {
      const tx = await getNextTx(channel)
      await addHistory(tx)
      setCurrentTx(tx)
    } catch(e) {
      logger.error('Next failed',e)
      setError('Failed to load next.')
    } finally { setLoading(false) }
  }
  const handleBack = async ()=>{
    setError(null); setLoading(true)
    try {
      const prev = await goBack()
      if(prev) setCurrentTx(prev)
      else setError('No previous content.')
    } catch(e) {
      logger.error('Back failed',e)
      setError('Failed to go back.')
    } finally { setLoading(false) }
  }

  // Share
  const handleShare = async ()=>{
    if(!txUrl) return
    if(navigator.share) await navigator.share({ title:'Woa, check this out!', text:`Check out what I found roaming the Permaweb! ${txUrl}`, url:txUrl})
    else { await navigator.clipboard.writeText(txUrl); alert('Copied!') }
  }

  return (
    <div className="app">
           {/* Ad overlay sits at the top */}
     {showAd && (
       <AdOverlay src="/assets/static-ad.jpg" onClose={handleCloseAd} />
     )}
      <header className="app-header">
        <div className="banner">
          <img src="/assets/banner.png" alt="Roam the Permaweb Banner" />
        </div>
      </header>

      {zoomSrc && <ZoomOverlay src={zoomSrc} onClose={() => setZoomSrc(null)} />}

      {/* Controls with Channels button */}
      <div className="controls">
        <button className="btn back-btn" onClick={handleBack} disabled={!currentTx||loading}>← Back</button>
        <button className="btn channels-btn" onClick={openChannels} title="Channels">⚙️</button>
        <button className="btn next-btn" onClick={handleNext} disabled={loading||queueLoading}>Roam →</button>
      </div>

      {error && <div className="error">{error}</div>}

      <main className="media-container">
        {loading && <div className="loading">Loading…</div>}
        {!currentTx&&!loading && <div className="placeholder">Tap “Roam” to start!</div>}
        {currentTx&&!loading && <>
          <MediaView
            txMeta={currentTx}
            privacyOn={privacyOn}
            onPrivacyToggle={togglePrivacy}
            onZoom={(src) => setZoomSrc(src)}
          />

          {/* —— subtle tx/owner info —— */}
          <div className="tx-info">
            <a
              href={`https://viewblock.io/arweave/tx/${currentTx.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              TX: {currentTx.id.slice(0,6)}…
            </a>
            <span></span>
            <a
              href={`https://viewblock.io/arweave/address/${currentTx.owner.address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Owner: {currentTx.owner.address.slice(0,6)}…
            </a>
            <span></span>
            <a
              className="tx-info-time"
              href={`https://viewblock.io/arweave/block/${currentTx.block.height}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {formattedTime}
            </a>
          </div>

          <div className="media-actions">
            <button className="btn share-btn" onClick={handleShare}>🔗 Share</button>
            <button className="btn details-btn" onClick={()=>setDetailsOpen(true)}>📇 Details</button>
          </div>
        </>}
      </main>

      {/* Details Drawer */}
      <DetailsDrawer
        txMeta={currentTx}
        open={detailsOpen}
        onClose={()=>setDetailsOpen(false)}
      />

      {/* Channels Backdrop & Drawer */}
      <div className={`channels-backdrop ${showChannels? 'open':''}`} onClick={closeChannels} />
      <div className={`channels-drawer ${showChannels? 'open':''}`}>
        <button className="drawer-close" onClick={closeChannels}>✖️</button>
        <h2>Channels</h2>
        <div className="channel-picker">
          <button className={media==='image'?'active':''} onClick={()=>{setMedia('image'); closeChannels()}}>🖼 Images</button>
          <button className={media==='music'?'active':''} onClick={()=>{setMedia('music'); closeChannels()}}>🎵 Music</button>
          <button className={media==='video'?'active':''} onClick={()=>{setMedia('video'); closeChannels()}}>🎬 Videos</button>
          <button className={media==='website'?'active':''} onClick={()=>{setMedia('website'); closeChannels()}}>🌐 Websites</button>
          <button className={media==='text'?'active':''} onClick={()=>{setMedia('text'); closeChannels()}}>📖 Text</button>
          <button className={media==='anything'? 'active' : ''} onClick={()=>{setMedia('anything'); closeChannels()}}>⚡ Anything</button>
        </div>
        <h3>When</h3>
        <div className="time-picker">
          <button className={recency==='new'?'active':''} onClick={()=>{setRecency('new'); closeChannels()}}>⏰ New</button>
          <button className={recency==='old'?'active':''} onClick={()=>{setRecency('old'); closeChannels()}}>🗄️ Old</button>
        </div>
        {/* Owner filter controls moved into drawer */}
        {currentTx && (
          <div className="owner-filter">
            {ownerAddress === currentTx.owner.address ? (
              <button className="btn active" onClick={() => { setOwnerAddress(undefined); closeChannels(); }}>
                👥 Show everyone
              </button>
            ) : (
              <button className="btn" onClick={() => { setOwnerAddress(currentTx.owner.address); closeChannels(); }}>
                👤 More from this owner
              </button>
            )}
          </div>
        )}
      </div>
      
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
          <span className="footer-separator">|</span>
          <a href="https://github.com/vilenarios/roam" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </nav>
      <div className="footer-copy">Roam v0.0.1</div>
    </footer>
      {/* About Modal */}
        {showAbout && (
          <div className="about-modal">
            <div className="modal-backdrop" onClick={() => setShowAbout(false)} />
            <div className="modal-content">
              <h2>Ready to Roam?</h2>
              <p>
                This playful app lets you randomly explore Arweave content:
                images, music, videos, websites, and even text documents.
                <br></br>
                <br></br>
                Just pick a channel, choose New or Old, and click Next to
                roam around the permaweb. Filter by creator, dive deep into
                history, or share those hidden gems!
              </p>
              <button className="modal-close-btn" onClick={() => setShowAbout(false)}>
              ✖️
              </button>
            </div>
          </div>
      )}
    </div>
  )
}