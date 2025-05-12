// src/components/DetailsDrawer.tsx
import type { JSX } from 'preact/jsx-runtime'
import '../styles/details-drawer.css'
import { useState } from 'preact/hooks'
import type { TxMeta } from '../constants'

export interface DetailsDrawerProps {
  txMeta: TxMeta | null
  open: boolean
  onClose: () => void
}

/**
 * A sliding drawer that displays full transaction metadata
 * and share controls.
 */
export const DetailsDrawer = ({ txMeta, open, onClose }: DetailsDrawerProps): JSX.Element | null => {
  if (!open || !txMeta) return null

  const { id, owner, fee, quantity, tags, data, block } = txMeta
  const [showAllTags, setShowAllTags] = useState(false);
  const visibleTags = showAllTags ? tags : tags.slice(0, 5);
  return (
    <>
      <div className="details-backdrop open" onClick={onClose} />
      <aside className="details-drawer open" role="dialog" aria-modal="true">
        <header className="details-header">
          <h2>Transaction Details</h2>
          <button className="details-close-btn" aria-label="Close details" onClick={onClose}>×</button>
        </header>
        <div className="details-content">
          <dl>
            <dt>ID</dt>
            <dd className="mono">
              <a href={`https://viewblock.io/arweave/tx/${id}`} target="_blank" rel="noopener noreferrer">
                {id}
              </a>
            </dd>

            <dt>Owner</dt>
            <dd className="mono">
              <a href={`https://viewblock.io/arweave/address/${owner.address}`} target="_blank" rel="noopener noreferrer">
                {owner.address}
              </a>
            </dd>

            <dt>When</dt>
            <dd>{new Date(block.timestamp * 1000).toLocaleString()}</dd>

            <dt>Block Height</dt>
            <dd>{block.height}</dd>

            <dt>Size</dt>
            <dd>{data.size.toLocaleString()} bytes</dd>

            <dt>Fee</dt>
            <dd>{parseFloat(fee.ar).toFixed(6)} AR</dd>

            <dt>Quantity</dt>
            <dd>{parseFloat(quantity.ar).toFixed(6)} AR</dd>

            <dt>Tags</dt>
            <dd>
            <div className="tag-list">
                {visibleTags.map(tag => (
                <span className="tag-item" key={`${tag.name}-${tag.value}`}>
                    <strong>{tag.name}:</strong> {tag.value}
                </span>
                ))}
                {tags.length > 5 && (
                <button
                    class="more-tags"
                    onClick={() => setShowAllTags(f => !f)}
                >
                    {showAllTags ? 'Show fewer tags' : `+${tags.length - 5} more`}
                </button>
                )}
            </div>
            </dd>
          </dl>
        </div>
      </aside>
    </>
  )
}