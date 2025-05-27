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
import { fetchTxMetaById, getCurrentBlockHeight } from './engine/query'
import { BlockRangeSlider } from './components/BlockRangeSlider'

export function App() {
  const blockRangeRef = useRef<{ min?: number; max?: number } | null>(null);

  // at top of your component
  type DeepLinkOpts = {
    initialTx?: TxMeta;
    minBlock?: number;
    maxBlock?: number;
    channel?: Channel;
    ownerAddress?: string;
    appName?: string;
  };

  const [deepLinkOpts, setDeepLinkOpts] = useState<DeepLinkOpts| null>(null);
  const [deepLinkParsed, setDeepLinkParsed] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string|undefined>()
  const [appName, setAppName] = useState<string|undefined>()

  // run once on mount
  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams(window.location.search);

    getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]).then(setChainTip);

    (async () => {
      const opts: DeepLinkOpts = {};

      // 1) txid → fetch immediately
      if (params.has('txid')) {
        const txid = params.get('txid')!;
        opts.initialTx = await fetchTxMetaById(txid);
      }

      // 2) ownerAddress → read but only set state if present
      if (params.has('ownerAddress')) {
        opts.ownerAddress = params.get('ownerAddress')!;
        if (isMounted) setOwnerAddress(opts.ownerAddress);
      }

      if (params.has('appName')) {
        opts.appName = params.get('appName')!;
        if (isMounted) setAppName(opts.appName);
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
            ownerAddress: undefined, // owner comes from opts.ownerAddress
            appName: undefined
          };
          if (isMounted) setMedia(rawMedia as MediaType);
        } else {
          console.warn('Ignoring invalid channel media:', rawMedia);
        }
      } else {
        opts.channel = {
          media: 'everything' as MediaType,
          recency,
          ownerAddress: undefined,
          appName: undefined
        }
      }

      // stash whatever we found
      if (isMounted) setDeepLinkOpts(opts);

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

  const [tempRange, setTempRange] = useState<{ min: number; max: number }>({ min: 1, max: 1_000_000_000_000_000 });
  const [rangeSlider, setRangeSlider] = useState<{ min: number; max: number }>({ min: 1, max: 1_000_000_000_000_000 });
  const [chainTip, setChainTip] = useState(9999999); // Fallback until fetched
  const [rangeError, setRangeError] = useState<string | null>(null);

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
  const [media, setMedia] = useState<Channel['media']>('images')
  const [recency, setRecency] = useState<Channel['recency']>('old')
  const channel: Channel = { media, recency, ownerAddress, appName }

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

      // Only use deepLinkOpts on first run, then clear them
      const opts = deepLinkOpts?.initialTx || deepLinkOpts?.minBlock != null || deepLinkOpts?.ownerAddress != null
        ? { 
            initialTx:   deepLinkOpts.initialTx,
            minBlock:    deepLinkOpts.minBlock,
            maxBlock:    deepLinkOpts.maxBlock,
            ownerAddress: deepLinkOpts.ownerAddress,
            appName: deepLinkOpts.appName
          }
        : {};

      const range = await initFetchQueue(channel, opts as any);
      if (!cancelled && range) {
        // you can store this in state, too, if you want to display it
        blockRangeRef.current = range;
        setRangeSlider(range);
        setTempRange(range);
      }

      let firstTx: TxMeta | null = null;
      if (opts.initialTx) {
        firstTx = opts.initialTx;
      } else {
        firstTx = await getNextTx(channel);
      }

      if (!cancelled) {
        if (!firstTx) {
          setError("No content found to initialize.");
        } else {
          setCurrentTx(firstTx);
          await addHistory(firstTx);
        }
      }
      if (deepLinkOpts) {
        setDeepLinkOpts(null);
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
  }, [media, recency, ownerAddress, appName, deepLinkParsed]);
  
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
        const tx = await goForward();
        if (tx) {
          setCurrentTx(tx);
          // logger.debug('Next: reused forward history');
        } else {
          setError('Unexpected missing forward history.');
        }
      } else {
              const tx = await getNextTx(channel);
              if (!tx) {
                // logger.debug("No more content in this channel.");
              } else {
                await addHistory(tx);
                setCurrentTx(tx);
                // logger.debug('Next: added new tx to history');
              }
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
      if (range) {
        blockRangeRef.current = range;
        setTempRange(range);
      }

      // 3) grab and show the very first tx
      const tx = await getNextTx(channel);
      if (!tx) {
          setError("Couldn’t start roam: no items found.");
        } else {
          await addHistory(tx);
          setCurrentTx(tx);
        }
    } catch (e) {
      logger.error('Roam failed', e);
      setError('Failed to start new roam.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleShare = async () => {
    if (!currentTx) return;
  
    const params = new URLSearchParams();
    params.set("txid", currentTx.id);
    params.set("channel", media);
  
    // if you have an explicit ownerAddress filter, include it
    if (ownerAddress) {
      params.set("ownerAddress", ownerAddress);
    }

    if (appName) {
      params.set("appName", appName);
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

  const handleDownload = async () => {
    if (!currentTx) return;

    const arfsMeta = currentTx.arfsMeta;
    const dataTxId = arfsMeta?.dataTxId || currentTx.id;
    const filename = arfsMeta?.name || dataTxId;

    try {
      const response = await fetch(`${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download the file.");
    }
  };

  
  return (
    <div className="app">
      {!accepted && (
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
      )}
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
            <button className="btn download-btn" onClick={handleDownload}>⬇️ Download</button>
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
          <button className={media==='arfs'? 'active' : ''} onClick={()=>{setMedia('arfs'); closeChannels()}}>📁 ArFS</button>
          <button className={media==='everything'? 'active' : ''} onClick={()=>{setMedia('everything'); closeChannels()}}>⚡ Everything</button>
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
        <h3>When</h3>
        <div className="time-picker">
          <button className={recency==='new'?'active':''} onClick={()=>{setRecency('new'); closeChannels()}}>⏰ New</button>
          <button className={recency==='old'?'active':''} onClick={()=>{setRecency('old'); closeChannels()}}>🗄️ Old</button>
        </div>
        <BlockRangeSlider
          tempRange={tempRange}
          setTempRange={setTempRange}
          chainTip={chainTip}
        />

        {rangeError && <div className="slider-error">{rangeError}</div>}

        <div className="block-range-actions">
          <button
            className="btn"
            onClick={() => {
              setTempRange(rangeSlider); // revert changes
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={async () => {
              if (tempRange.min >= tempRange.max) return;
              setQueueLoading(true);
              setRangeError(null);
              try {
                setRangeSlider(tempRange);
                setCurrentTx(null);
                await initFetchQueue(
                  { media, recency, ownerAddress, appName },
                  { minBlock: tempRange.min, maxBlock: tempRange.max, ownerAddress, appName }
                );
                blockRangeRef.current = { min: tempRange.min, max: tempRange.max };
                const tx = await getNextTx(channel);
                if (!tx) {
                  setError("No items found within this block range.");
                } else {
                  await addHistory(tx);
                  setCurrentTx(tx);
                }
                closeChannels();
              } catch (err) {
                setRangeError("Couldn’t apply custom block range.");
                console.error(err);
              } finally {
                setQueueLoading(false);
              }
            }}
            disabled={tempRange.min >= tempRange.max || queueLoading}
          >
            {queueLoading ? "Loading…" : "Apply"}
          </button>
        </div>
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
          <a href="https://github.com/roam-the-permaweb/roam-web" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </nav>
      <div className="footer-copy">Roam v0.0.4</div>
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