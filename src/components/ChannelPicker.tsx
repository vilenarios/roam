import { useState } from 'preact/hooks'

const MEDIA = ['image', 'video', 'html', 'website'] as const
const RECENCY = ['recent', 'historic'] as const

type Channel = {
  media: typeof MEDIA[number]
  recency: typeof RECENCY[number]
}

interface Props { onChange: (c: Channel) => void }

export default function ChannelPicker({ onChange }: Props) {
  const [media, setMedia] = useState<Channel['media']>('image')
  const [recency, setRecency] = useState<Channel['recency']>('recent')
  return (
    <div class="flex gap-2">
      <select
        value={media}
        onInput={(e) => {
          const v = (e.target as HTMLSelectElement).value as Channel['media']
          setMedia(v)
          onChange({ media: v, recency })
        }}
      >
        {MEDIA.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <select
        value={recency}
        onInput={(e) => {
          const v = (e.target as HTMLSelectElement).value as Channel['recency']
          setRecency(v)
          onChange({ media, recency: v })
        }}
      >
        {RECENCY.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
    </div>
  )
}
