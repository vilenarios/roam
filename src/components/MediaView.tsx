import React, { useState, useEffect } from 'react'
import { logger } from '../utils/logger'

// Change this if you host a custom Arweave gateway for data
const DATA_GATEWAY = import.meta.env.VITE_DATA_GATEWAY || 'https://arweave.net'
// Threshold for auto-loading media: 2 MB
const AUTO_LOAD_THRESHOLD = 2 * 1024 * 1024

export interface MediaViewProps {
  /** Transaction ID to render */
  txId: string
}

export const MediaView: React.FC<MediaViewProps> = ({ txId }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contentType, setContentType] = useState<string | null>(null)
  const [size, setSize] = useState<number>(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [manualLoad, setManualLoad] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError(null)
      setBlob(null)
      setManualLoad(false)

      try {
        const headUrl = `${DATA_GATEWAY}/tx/${txId}/data?raw`
        // 1) HEAD to get size & type
        const headRes = await fetch(headUrl, { method: 'HEAD' })
        if (!headRes.ok) throw new Error(`HEAD ${headRes.status}`)
        const ct = headRes.headers.get('Content-Type') || ''
        const cl = Number(headRes.headers.get('Content-Length') || '0')
        logger.debug('HEAD fetched', { txId, contentType: ct, size: cl })

        if (cancelled) return
        setContentType(ct)
        setSize(cl)

        // 2) Decide auto- vs manual-load
        if (ct.startsWith('image/') || ct.startsWith('video/')) {
          if (cl <= AUTO_LOAD_THRESHOLD) {
            // auto-load small media
            const getRes = await fetch(headUrl)
            if (!getRes.ok) throw new Error(`GET ${getRes.status}`)
            const dataBlob = await getRes.blob()
            if (cancelled) return
            setBlob(dataBlob)
          } else {
            logger.info('Large media requires manual load', { txId, size: cl })
            setManualLoad(true)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('Media HEAD error', { txId, error: msg })
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [txId])

  // Handler for manual-load button
  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `${DATA_GATEWAY}/tx/${txId}/data?raw`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`GET ${res.status}`)
      const dataBlob = await res.blob()
      setBlob(dataBlob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Manual media load error', { txId, error: msg })
      setError(msg)
    } finally {
      setLoading(false)
      setManualLoad(false)
    }
  }

  // Render states
  if (loading) {
    return <div className="media-loading">Loading content...</div>
  }
  if (error) {
    return <div className="media-error">Error loading content: {error}</div>
  }

  // Manual placeholder
  if (manualLoad) {
    return (
      <button className="media-load-btn" onClick={handleLoad}>
        Tap to load content ({(size / 1024).toFixed(1)} KB)
      </button>
    )
  }

  // If blob is loaded, render media
  if (blob && contentType) {
    const objectUrl = URL.createObjectURL(blob)
    if (contentType.startsWith('image/')) {
      return <img src={objectUrl} alt="Surf content" className="media-img" />
    }
    if (contentType.startsWith('video/')) {
      return <video src={objectUrl} controls className="media-video" />
    }
  }

  // Fallback for HTML/website: iframe embed of entire page
  const iframeUrl = `${DATA_GATEWAY}/${txId}`
  return <iframe src={iframeUrl} className="media-iframe" sandbox="allow-scripts allow-same-origin" />
}
