// src/App.tsx
import { useState, useEffect, useRef } from 'preact/hooks'
import { initFetchQueue, getNextTx, GATEWAY_DATA_SOURCE } from './engine/fetchQueue'
import { addHistory, goBack, goForward, peekForward, resetHistory } from './engine/history'
import { MediaView } from './components/MediaView'
import { DetailsDrawer } from './components/DetailsDrawer'
import { logger } from './utils/logger'
import './styles/app.css'
import './styles/channels-drawer.css'
import { useInterstitialInjector } from './hooks/useInterstitialInjector'
import { MAX_AD_CLICKS, MIN_AD_CLICKS, type Channel, type TxMeta } from './constants'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { fetchTxMetaById } from './engine/query'

export function App() {

  const deepLinkParamsRef = useRef<{
    initialTx?: TxMeta
    minBlock?: number
    maxBlock?: number
  }>({});
  const blockRangeRef = useRef<{ min?: number; max?: number } | null>(null);
  
  // Add at the top of your component
  const [initialParams, setInitialParams] = useState<{
    txid?: string
    channel?: Channel['media']
    ownerFilter?: boolean
    minBlock?: number
    maxBlock?: number
  } | null>(null)

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

  const { recordClick, shouldShowInterstitial, reset } = useInterstitialInjector(MIN_AD_CLICKS, MAX_AD_CLICKS);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const handleCloseAd = () => {
    setShowInterstitial(false);
    reset();
    // after ad, go to next
    handleNext();
  };

  // Channel & time
  const [media, setMedia] = useState<Channel['media']>('everything')
  const [recency, setRecency] = useState<Channel['recency']>('old')
  const channel: Channel = { media, recency, ownerAddress }

  // Channels drawer
  const [showChannels, setShowChannels] = useState(false)
  const openChannels = () => setShowChannels(true)
  const closeChannels = () => setShowChannels(false)

  // get deep link params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const txid = params.get('txid') || undefined
    const channel = (params.get('channel') as Channel['media']) || undefined
    const ownerFilter = params.get('owner') === 'true'
    const minBlock = params.get('minBlock') ? parseInt(params.get('minBlock')!, 10) : undefined
    const maxBlock = params.get('maxBlock') ? parseInt(params.get('maxBlock')!, 10) : undefined
  
    setInitialParams({ txid, channel, ownerFilter, minBlock, maxBlock })
  }, [])

  // query for any initial params
  useEffect(() => {
    if (!initialParams || !initialParams.txid) return;

    (async () => {
      try {
        setLoading(true)
        const tx = await fetchTxMetaById(initialParams.txid!)

        // Set filters from URL
        if (initialParams.channel) setMedia(initialParams.channel)
        if (initialParams.ownerFilter) setOwnerAddress(tx.owner.address)

        // Pass deep link config to initFetchQueue later
        deepLinkParamsRef.current = {
          initialTx: tx,
          minBlock: initialParams.minBlock,
          maxBlock: initialParams.maxBlock
        }

        setCurrentTx(tx)
        await addHistory(tx)

        logger.info('Loaded deep-linked TX', tx.id)
      } catch (e) {
        logger.error('Failed to load deep link tx', e)
        setError('Invalid or missing TX')
      } finally {
        setLoading(false)
      }
    })()
  }, [initialParams])
  
  // clear params in url after
  useEffect(() => {
    if (initialParams?.txid) {
      const url = new URL(window.location.href)
      url.search = ''
      window.history.replaceState({}, '', url.toString())
    }
  }, [initialParams])
  
  // lock scroll when drawers open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen||showChannels)
  }, [detailsOpen, showChannels])

  // fetch queue on channel change or deep link
  useEffect(() => {
    const run = async () => {
      try {
        setQueueLoading(true)
        setCurrentTx(null)

        // ✂️ Pull options out of the ref (if any) and then clear it
        const opts = { ...deepLinkParamsRef.current };
        deepLinkParamsRef.current = {};  
  
        // example everything link 
        // http://localhost:5173/?txid=2BsdYi2h_QW3DaCTo_DIB9ial6lgh-lzo-riyuauw9A&channel=everything&minBlock=842020&maxBlock=842119
        // Pass opts into initFetchQueue; if opts.initialTx is undefined,
        // it just does the normal new/old logic
        const result = await initFetchQueue(channel, opts);
        if (result) blockRangeRef.current = result;
  
        logger.info('Fetch queue initialized')
      } catch (e) {
        logger.error('Init failed', e)
        setError('Init error')
      } finally {
        setQueueLoading(false)
      }
    }
    run()
  }, [media, recency, ownerAddress])

  const txUrl = currentTx ? `${GATEWAY_DATA_SOURCE[0]}/${currentTx.id}` : ''
  const formattedTime = currentTx
    ? new Date(currentTx.block.timestamp * 1000).toLocaleString(undefined, {
        year:   'numeric',
        month:  'short',
        day:    'numeric',
      })
    : ''

  // Reset/Back/Next/Roam handlers
  const handleReset = async () => {
    try {
      await resetHistory();
      setCurrentTx(null);
      logger.debug('History reset');
    } catch (e) {
      logger.error('Reset failed', e);
      setError('Failed to reset history.');
    }
  };
  
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

  const handleNext = async () => {
    setError(null);
    setLoading(true);
    recordClick();
  
    if (shouldShowInterstitial) {
      setShowInterstitial(true);
      setLoading(false);
      return;
    }
  
    try {
      const forward = await peekForward()
      if (forward) {
        const tx = await goForward()
        setCurrentTx(tx!)
        logger.debug('Next: reused forward history')
      } else {
        const tx = await getNextTx(channel)
        await addHistory(tx)
        setCurrentTx(tx)
        logger.debug('Next: added new tx to history')
      }
    } catch (e) {
      logger.error('Next failed', e)
      setError('Failed to load next.')
    } finally {
      setLoading(false)
    }
  };

  const handleRoam = async () => {
    setError(null);
    setLoading(true);
    try {
        // 1) reset URL logic + history
      deepLinkParamsRef.current = {};
      setCurrentTx(null);

      // 2) init a brand-new queue
      const range = await initFetchQueue(channel);
      if (range) blockRangeRef.current = range;

      // 3) grab and show the very first tx
      const tx = await getNextTx(channel);
      await addHistory(tx);
      setCurrentTx(tx);
    } catch (e) {
      logger.error('Roam failed', e);
      setError('Failed to start new roam.');
    } finally {
      setLoading(false);
    }
  };
  
  // Share
  const handleShare = async () => {
    if (!currentTx) return;
  
    const params = new URLSearchParams();
    params.set("txid", currentTx.id);
    params.set("channel", media);
    if (ownerAddress === currentTx.owner.address) {
      params.set("owner", "true");
    }
  
    const min = blockRangeRef.current?.min;
    const max = blockRangeRef.current?.max;
    if (min && max) {
      params.set("minBlock", String(min));
      params.set("maxBlock", String(max));
    }
  
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  
    if (navigator.share) {
      await navigator.share({
        title: "Woa, check this out!",
        text: `Check out what I found roaming the Permaweb! ${shareUrl}`,
        url: shareUrl,
      });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert("Copied!");
    }
  };
  

  return (
    <div className="app">
           {/* Interstitial overlay sits at the top */}
     {showInterstitial && (
       <Interstitial src="/assets/static-ad.jpg" onClose={handleCloseAd} />
     )}
      <header className="app-header">
        <div className="banner">
          <img src="/assets/banner.png" alt="Roam the Permaweb Banner" />
        </div>
      </header>

      {zoomSrc && <ZoomOverlay src={zoomSrc} onClose={() => setZoomSrc(null)} />}

      {/* Controls with Channels button */}
      <div className="controls">
        <button className="btn reset-btn" onClick={handleReset} disabled={loading}>🔄 Reset</button>
        <button className="btn back-btn" onClick={handleBack} disabled={!currentTx||loading}>← Back</button>
        <button className="btn channels-btn" onClick={openChannels} title="Channels">⚙️</button>
        <button className="btn next-btn" onClick={handleNext} disabled={loading||queueLoading}>Next →</button>
        <button className="btn roam-btn" onClick={handleRoam} disabled={loading || queueLoading}>Roam 🎲</button>
      </div>

      {error && <div className="error">{error}</div>}

      <main className="media-container">
        {loading && <div className="loading">Loading…</div>}
        {!currentTx&&!loading && <div className="placeholder">Feeling curious? Tap “Next” to explore — or “Roam” to spin the dice.</div>}
        {currentTx&&!loading && <>
          <MediaView
            txMeta={currentTx}
            privacyOn={privacyOn}
            onPrivacyToggle={togglePrivacy}
            onZoom={(src) => setZoomSrc(src)}
            onCorrupt={() => handleNext()} // skip corrupt tx automatically
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
          <button className={media==='everything'? 'active' : ''} onClick={()=>{setMedia('everything'); closeChannels()}}>⚡ Everything</button>
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
      <div className="footer-copy">Roam v0.0.2</div>
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