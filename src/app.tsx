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
import { MAX_AD_CLICKS, MEDIA_TYPES, MIN_AD_CLICKS, type Channel, type MediaType, type TxMeta } from './constants'
import { ZoomOverlay } from './components/ZoomOverlay'
import { Interstitial } from './components/Interstitial'
import { fetchTxMetaById } from './engine/query'

export function App() {
  const blockRangeRef = useRef<{ min?: number; max?: number } | null>(null);

  // at top of your component
  type DeepLinkOpts = {
    initialTx?: TxMeta;
    minBlock?: number;
    maxBlock?: number;
    channel?: Channel;
    ownerAddress?: string;
  };

  const [deepLinkOpts, setDeepLinkOpts] = useState<DeepLinkOpts| null>(null);
  const [deepLinkParsed, setDeepLinkParsed] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string|undefined>()

// run once on mount
useEffect(() => {
  let isMounted = true;
  const params = new URLSearchParams(window.location.search);

  (async () => {
    const opts: DeepLinkOpts = {};

    // 1) txid → fetch immediately
    if (params.has('txid')) {
      const txid = params.get('txid')!;
      opts.initialTx = await fetchTxMetaById(txid);
    }

    // 2) ownerAddress → read but only set state if present
    if (params.has('ownerAddress')) {
      const addr = params.get('ownerAddress')!;
      opts.ownerAddress = addr;
      if (isMounted) setOwnerAddress(addr);
    }

    // 3) minBlock / maxBlock → read into opts
    if (params.has('minBlock')) {
      opts.minBlock = Number(params.get('minBlock'));
    }
    if (params.has('maxBlock')) {
      opts.maxBlock = Number(params.get('maxBlock'));
    }

    // 4) channel → only parse media, use existing recency state
    if (params.has('channel')) {
      const rawMedia = params.get('channel')!;
      if (MEDIA_TYPES.includes(rawMedia as MediaType)) {
        opts.channel = {
          media: rawMedia as MediaType,
          recency,                // keep whatever your UI had selected
          ownerAddress: undefined // owner comes from opts.ownerAddress
        };
        if (isMounted) setMedia(rawMedia as MediaType);
      } else {
        console.warn('Ignoring invalid channel media:', rawMedia);
      }
    }

    // stash whatever we found
    if (isMounted) setDeepLinkOpts(opts);
    logger.debug(`Got Deeplink opts: `, opts)

    // clear the URL so we don’t re-parse on every render
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    // signal “parsing done” so your initEffect can run
    if (isMounted) setDeepLinkParsed(true);
  })();

  return () => { isMounted = false; };
}, []); // only on mount

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

  const {recordClick, shouldShowInterstitial, reset} = useInterstitialInjector(MIN_AD_CLICKS, MAX_AD_CLICKS);
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
  
  // lock scroll when drawers open
  useEffect(() => {
    document.body.classList.toggle('drawer-open', detailsOpen||showChannels)
  }, [detailsOpen, showChannels])

  // when filters change **and** after deep-link has parsed, fire exactly one init
  useEffect(() => {
    if (!deepLinkParsed) return;

    let cancelled = false;
    (async () => {
      setQueueLoading(true);
      setCurrentTx(null);
      setError(null);

      // choose which opts to pass:
      const opts = deepLinkOpts
        ? {
            initialTx: deepLinkOpts.initialTx,
            minBlock: deepLinkOpts.minBlock,
            maxBlock: deepLinkOpts.maxBlock,
            ownerAddress: deepLinkOpts.ownerAddress,
          }
        : {};

      const range = await initFetchQueue(channel, opts as any);
      if (!cancelled && range) {
        // you can store this in state, too, if you want to display it
        blockRangeRef.current = range;
      }

      const firstTx = opts.initialTx ?? await getNextTx(channel);
      if (!cancelled) {
        setCurrentTx(firstTx);
        await addHistory(firstTx);
      }
    })()
      .catch(e => {
        if (!cancelled) {
          logger.error('Init failed', e);
          setError('Couldn’t load content');
        }
      })
      .finally(() => {
        if (!cancelled) setQueueLoading(false);
      });

    return () => { cancelled = true };
  }, [media, recency, deepLinkParsed]);
  
  // http://localhost:5173/?txid=2BsdYi2h_QW3DaCTo_DIB9ial6lgh-lzo-riyuauw9A&channel=everything&minBlock=842020&maxBlock=842119

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
  
    // if you have an explicit ownerAddress filter, include it
    if (ownerAddress) {
      params.set("ownerAddress", ownerAddress);
    }
  
    // explicitly check for undefined, not falsy
    const min = blockRangeRef.current?.min;
    const max = blockRangeRef.current?.max;
    if (min !== undefined && max !== undefined) {
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
          <button className={media==='images'?'active':''} onClick={()=>{setMedia('images'); closeChannels()}}>🖼 Images</button>
          <button className={media==='music'?'active':''} onClick={()=>{setMedia('music'); closeChannels()}}>🎵 Music</button>
          <button className={media==='videos'?'active':''} onClick={()=>{setMedia('videos'); closeChannels()}}>🎬 Videos</button>
          <button className={media==='websites'?'active':''} onClick={()=>{setMedia('websites'); closeChannels()}}>🌐 Websites</button>
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