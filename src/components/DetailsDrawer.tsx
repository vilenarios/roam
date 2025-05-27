// src/components/DetailsDrawer.tsx
import type { JSX } from 'preact/jsx-runtime'
import '../styles/details-drawer.css'
import { useState } from 'preact/hooks'
import type { TxMeta } from '../constants'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'

export interface DetailsDrawerProps {
  txMeta: TxMeta | null
  open: boolean
  onClose: () => void
}

function shortenId(id: string, head = 6, tail = 6): string {
  return id.length > head + tail + 3 ? `${id.slice(0, head)}...${id.slice(-tail)}` : id;
}

export const DetailsDrawer = ({ txMeta, open, onClose }: DetailsDrawerProps): JSX.Element | null => {
  if (!open || !txMeta) return null

  const { id, owner, fee, quantity, tags, block, arfsMeta } = txMeta
  const [showAllTags, setShowAllTags] = useState(false)
  const visibleTags = showAllTags ? tags : tags.slice(0, 5)
  const gatewayDataSourceNoProtocol = GATEWAY_DATA_SOURCE[0].replace('https://', '')

  const driveIdTag = tags.find(tag => tag.name === 'Drive-Id')
  const fileIdTag = tags.find(tag => tag.name === 'File-Id')

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

            {/* I. File Metadata (ArFS Priority) */}
            {arfsMeta && (
              <>
                <dt>Filename</dt>
                <dd>{arfsMeta.name}</dd>

                <dt>File Type</dt>
                <dd>{arfsMeta.contentType}</dd>

                <dt>File Size</dt>
                <dd>{arfsMeta.size.toLocaleString()} bytes</dd>

                {arfsMeta.customTags?.lastModifiedDate && (
                  <>
                    <dt>Last Modified</dt>
                    <dd>{new Date(Number(arfsMeta.customTags.lastModifiedDate)).toLocaleString()}</dd>
                  </>
                )}

                <dt>ArFS Data Tx</dt>
                <dd className="mono">
                  <a
                    href={`https://viewblock.io/arweave/tx/${arfsMeta.dataTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={arfsMeta.dataTxId}
                  >
                    {shortenId(arfsMeta.dataTxId)}
                  </a>
                </dd>
              </>
            )}

            {/* II. ArDrive Links */}
            {(driveIdTag || fileIdTag) && (
              <>
                <dt>ArDrive Links</dt>
                <dd>
                  <div className="tag-list">
                    {driveIdTag && (
                      <span className="tag-item" key={`drive-${driveIdTag.value}`}>
                        <strong>Drive-Id:</strong>{' '}
                        <a
                          href={`https://ardrive.${gatewayDataSourceNoProtocol}/#/drives/${driveIdTag.value}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={driveIdTag.value}
                        >
                          {shortenId(driveIdTag.value)}
                        </a>
                      </span>
                    )}
                    {fileIdTag && (
                      <span className="tag-item" key={`file-${fileIdTag.value}`}>
                        <strong>File-Id:</strong>{' '}
                        <a
                          href={`https://ardrive.${gatewayDataSourceNoProtocol}/#/file/${fileIdTag.value}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={fileIdTag.value}
                        >
                          {shortenId(fileIdTag.value)}
                        </a>
                      </span>
                    )}
                  </div>
                </dd>
              </>
            )}

            {/* III. Blockchain Info */}
            <dt>Transaction ID</dt>
            <dd className="mono">
              <a href={`https://viewblock.io/arweave/tx/${id}`} target="_blank" rel="noopener noreferrer" title={id}>
                {shortenId(id)}
              </a>
            </dd>

            <dt>Owner</dt>
            <dd className="mono">
              <a href={`https://viewblock.io/arweave/address/${owner.address}`} target="_blank" rel="noopener noreferrer" title={owner.address}>
                {shortenId(owner.address)}
              </a>
            </dd>

            <dt>Block Height</dt>
            <dd>{block.height}</dd>

            <dt>When</dt>
            <dd>{new Date(block.timestamp * 1000).toLocaleString()}</dd>

            {parseFloat(fee.ar) > 0 && (
              <>
                <dt>Fee</dt>
                <dd>{parseFloat(fee.ar).toFixed(6)} AR</dd>
              </>
            )}

            {parseFloat(quantity.ar) > 0 && (
              <>
                <dt>Quantity</dt>
                <dd>{parseFloat(quantity.ar).toFixed(6)} AR</dd>
              </>
            )}

            {/* IV. Raw Transaction Tags */}
            <dt>Transaction Tags</dt>
            <dd>
              <div className="tag-list">
                {visibleTags.map(tag => {
                  const isDriveOrFile = tag.name === 'Drive-Id' || tag.name === 'File-Id'
                  if (isDriveOrFile) return null // Already shown above

                  return (
                    <span className="tag-item" key={`${tag.name}-${tag.value}`}>
                      <strong>{tag.name}:</strong> {tag.value}
                    </span>
                  )
                })}
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

            {/* V. ArFS Custom Tags */}
            {arfsMeta && Object.keys(arfsMeta.customTags).length > 0 && (
              <>
                <dt>ArFS Tags</dt>
                <dd>
                  <div className="tag-list">
                    {Object.entries(arfsMeta.customTags).map(([key, value]) => (
                      <span className="tag-item" key={`arfs-${key}-${value}`}>
                        <strong>{key}:</strong> {value}
                      </span>
                    ))}
                  </div>
                </dd>
              </>
            )}
          </dl>
        </div>
      </aside>
    </>
  )
}