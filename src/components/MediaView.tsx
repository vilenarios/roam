import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { TxMeta } from '../engine/query'
import '../styles/media-view.css'
import { GATEWAYS_DATA } from '../engine/fetchQueue'

// Thresholds (bytes) above which we prompt manual load
const IMAGE_LOAD_THRESHOLD = 15 * 1024 * 1024
const VIDEO_LOAD_THRESHOLD = 50 * 1024 * 1024
const AUDIO_LOAD_THRESHOLD = 10 * 1024 * 1024

export interface MediaViewProps {
  /** Full transaction metadata fetched from GraphQL */
  txMeta: TxMeta
  /** Optional callback to open details drawer */
  onDetails?: () => void
}

export const MediaView = ({ txMeta, onDetails }: MediaViewProps) => {
  const { id, data: { size }, tags } = txMeta
  const contentType = tags.find(t => t.name === 'Content-Type')?.value || ''
  const directUrl = `${GATEWAYS_DATA[0]}/${id}`

  // Manual‐load flags
  const [manualLoad, setManualLoad] = useState(
    contentType.startsWith('image/') && size > IMAGE_LOAD_THRESHOLD
  )
  const [manualLoadVideo, setManualLoadVideo] = useState(
    contentType.startsWith('video/') && size > VIDEO_LOAD_THRESHOLD
  )
  const [manualLoadAudio, setManualLoadAudio] = useState(
    contentType.startsWith('audio/') && size > AUDIO_LOAD_THRESHOLD
  )
  // Text state
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  // Zoom state for images
  const [zoomed, setZoomed] = useState(false)

  // Reset on change
  useEffect(() => {
    setZoomed(false)
    setManualLoad(contentType.startsWith('image/') && size > IMAGE_LOAD_THRESHOLD)
    setManualLoadVideo(contentType.startsWith('video/') && size > VIDEO_LOAD_THRESHOLD)
    setManualLoadAudio(contentType.startsWith('audio/') && size > AUDIO_LOAD_THRESHOLD)
    setTextContent(null)
    setLoadingText(false)
    setErrorText(null)
  }, [id, contentType, size])

  // Fetch text
  useEffect(() => {
    let canceled = false
    if (!['text/plain', 'text/markdown'].includes(contentType)) return
    setLoadingText(true)
    fetch(directUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then(text => { if (!canceled) setTextContent(text) })
      .catch(() => { if (!canceled) setErrorText('Failed to load text') })
      .finally(() => { if (!canceled) setLoadingText(false) })
    return () => { canceled = true }
  }, [directUrl, contentType])

  // Hide overlays when zoomed
  useEffect(() => {
    document.body.classList.toggle('zoomed-media', zoomed)
  }, [zoomed])

  const renderMedia = () => {
    // Large image prompt
    if (contentType.startsWith('image/') && manualLoad) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoad(false)}>
          Tap to load image ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      )
    }
    // Image display
    if (contentType.startsWith('image/')) {
      return (
        <div className={`media-element image-container ${zoomed ? 'zoomed' : ''}`}>
          <img
            className="media-image"
            src={manualLoad ? undefined : directUrl}
            alt="Surf content"
            onClick={() => setZoomed(z => !z)}
          />
        </div>
      )
    }

    // Large video prompt
    if (contentType.startsWith('video/') && manualLoadVideo) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoadVideo(false)}>
          Tap to load video ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      )
    }
    // Video playback
    if (contentType.startsWith('video/')) {
      return <video className="media-element media-video" src={manualLoadVideo ? undefined : directUrl} controls preload="metadata" />
    }

    // Large audio prompt
    if (contentType.startsWith('audio/') && manualLoadAudio) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoadAudio(false)}>
          Tap to load audio ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      )
    }
    // Audio playback
    if (contentType.startsWith('audio/')) {
      return <audio className="media-element media-audio" src={manualLoadAudio ? undefined : directUrl} controls preload="metadata" />
    }

    // Text: plain and markdown
    if (['text/plain', 'text/markdown'].includes(contentType)) {
      if (loadingText) return <div className="media-loading">Loading…</div>
      if (errorText) return <div className="media-error">{errorText}</div>
      return (
        <div className="media-element text-container">
          <pre className="media-text">{textContent}</pre>
          <a className="open-tab-btn" href={directUrl} target="_blank" rel="noopener noreferrer">
            Open text in new tab
          </a>
        </div>
      )
    }

    // PDF embedding
    if (contentType === 'application/pdf') {
      return (
        <div className="media-element pdf-container">
          <iframe className="media-pdf" src={directUrl} title="PDF Viewer" />
          <a className="open-tab-btn" href={directUrl} target="_blank" rel="noopener noreferrer">
            Open PDF in new tab
          </a>
        </div>
      )
    }

    // Web pages / HTML
    if (
      contentType.startsWith('text/html') ||
      contentType === 'application/xhtml+xml' ||
      contentType.startsWith('application/x.arweave-manifest')
    ) {
      return (
        <div className="media-element website-container">
          <iframe className="media-iframe" src={directUrl} sandbox="allow-scripts allow-same-origin" title="Permaweb content preview" />
          <a className="open-tab-btn" href={directUrl} target="_blank" rel="noopener noreferrer">
            Open in new tab
          </a>
        </div>
      )
    }

    return <div className="media-error">Unsupported media type: {contentType}</div>
  }

  return (
    <div className="media-view-container">
      <div className="media-wrapper">
        {renderMedia()}
      </div>
      {onDetails && (
        <div className="media-actions">
          <button className="details-btn" onClick={onDetails}>Details</button>
        </div>
      )}
    </div>
  )
}
