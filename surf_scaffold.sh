#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Roam Web‑App Scaffold Script (v3)
# ---------------------------------------------------------------------------
# This idempotent script bootstraps the Roam permaweb project.
# Requirements: Node ≥18, pnpm ≥8, git. Run from the directory where you want
# the project folder created:
#   chmod +x roam_scaffold.sh && ./roam_scaffold.sh
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="roam"

if [[ -d $APP_NAME ]]; then
  echo "🛑  Directory '$APP_NAME' already exists. Remove it or choose another location." >&2
  exit 1
fi

##############################################################################
# 1. Create Vite + Preact + TS template (non‑interactive)                    #
##############################################################################

pnpm create vite@latest "$APP_NAME" -- --template preact-ts --no-git

cd "$APP_NAME"

##############################################################################
# 2. Install runtime & dev dependencies                                      #
##############################################################################

echo "📦  Installing runtime deps…"
pnpm add graphql-request zustand idb-keyval htmx.org

echo "🔧  Installing dev/tooling deps…"
pnpm add -D preact unocss @unocss/reset vite-plugin-pwa eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin vitest jsdom

##############################################################################
# 3. Write fresh vite.config.ts (avoids fragile sed)                         #
##############################################################################

cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    UnoCSS(),
    VitePWA({ registerType: 'prompt' }),
  ],
})
EOF

##############################################################################
# 4. UnoCSS config                                                           #
##############################################################################

cat > uno.config.ts <<'EOF'
import { defineConfig, presetUno, presetWind } from 'unocss'
export default defineConfig({ presets: [presetUno(), presetWind()] })
EOF

##############################################################################
# 5. Initial src folders                                                     #
##############################################################################

mkdir -p src/{components,engine,utils}

# Example component stub
cat > src/components/ChannelPicker.tsx <<'EOF'
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
EOF

##############################################################################
# 6. Finish                                                                  #
##############################################################################

echo "✅  Roam scaffold ready. Next steps:"
echo "   cd $APP_NAME"
echo "   pnpm install"  # ensure lockfile completes the install

echo "   pnpm dev       # run local dev server"
