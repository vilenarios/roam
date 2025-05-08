// src/components/MediaView.tsx
import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { TxMeta } from '../engine/query'
import { logger } from '../utils/logger'
import '../styles/media-view.css'

// Threshold (bytes) above which we prompt manual load for images
const AUTO_LOAD_THRESHOLD = 15 * 1024 * 1024

export interface MediaViewProps {
  /** Full transaction metadata fetched from GraphQL */
  txMeta: TxMeta
  /** Optional callback to open details drawer */
  onDetails?: () => void
}

export const MediaView = ({ txMeta, onDetails }: MediaViewProps) => {
  const { id, data: { size }, tags } = txMeta

  // Derive content-type from tags
  const contentType = tags.find(t => t.name === 'Content-Type')?.value || ''

  // Direct URL for streaming media and iframe
  const directUrl = `https://arweave.net/${id}`

  // Blob URL state for image fetch
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualLoad, setManualLoad] = useState(
    contentType.startsWith('image/') && size > AUTO_LOAD_THRESHOLD
  )

  // Effect: fetch blob for images only (to support manual-load prompt)
  useEffect(() => {
    let canceled = false

    if (!contentType.startsWith('image/')) {
      return
    }
    if (manualLoad) {
      return
    }

    async function fetchImage() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(directUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (canceled) return
        setBlobUrl(URL.createObjectURL(blob))
      } catch (err) {
        logger.error('Image load failed', err)
        if (!canceled) setError('Failed to load image')
      } finally {
        if (!canceled) setLoading(false)
      }
    }

    fetchImage()
    return () => {
      canceled = true
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [id, directUrl, contentType, manualLoad])

  // Render media based on content type
  const renderMedia = () => {
    // Manual load button for large images
    if (contentType.startsWith('image/') && manualLoad) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoad(false)}>
          Tap to load ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      )
    }
    // Images
    if (contentType.startsWith('image/')) {
      return blobUrl
        ? <img className="media-element media-image" src={blobUrl} alt="Surf content" />
        : null
    }
    // Videos
    if (contentType.startsWith('video/')) {
      return <video className="media-element media-video" src={directUrl} controls preload="metadata" />
    }
    // Audio
    if (contentType.startsWith('audio/')) {
      return <audio className="media-element media-audio" src={directUrl} controls preload="metadata" />
    }
    // Web pages / HTML
    if (
      contentType.startsWith('text/html') ||
      contentType === 'application/xhtml+xml' ||
      contentType === 'application/x.arweave-manifest+json'
    ) {
      return (
        <iframe
          className="media-element media-iframe"
          src={directUrl}
          sandbox="allow-scripts allow-same-origin"
          title="Permaweb content preview"
        />
      )
    }
    // Unknown type fallback
    return <div className="media-error">Unsupported media type: {contentType}</div>
  }

  return (
    <div className="media-view-container">
      <div className="media-wrapper">
        {loading && <div className="media-loading">Loading…</div>}
        {error && <div className="media-error">{error}</div>}
        {renderMedia()}
      </div>
      {onDetails && (
        <div className="media-actions">
          <button className="details-btn" onClick={onDetails}>
            Details
          </button>
        </div>
      )}
    </div>
  )
}
