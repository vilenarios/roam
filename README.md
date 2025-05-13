# Roam

> A thumb-friendly, shuffle-play interface for exploring the infinite Permaweb.

**Roam** is a lightweight, mobile-first web app that lets anyone discover random Arweave content—images, videos, music, HTML pages, and more—by tapping a single button.

Pure, decentralized surfing.

---

## 🌍 Live App

**[roam.ar.io](https://roam.ar.io)** — deployed on an [AR.IO Gateway](https://ar.io/) and resolved via [ArNS](https://docs.ar.io/arns).

---

## ✨ Features

- 🎛 **Channel Picker**  
  Choose your vibe: images, video, music, websites, text, or anything. Add a recency filter for "new" or "old" content.

- 🔀 **Roam Button**  
  Tap once to fetch a random Arweave transaction that matches your filter. Sit back and enjoy the ride.

- 🔙 **Back Navigation**  
  Local history lets you revisit what you just explored.  Refreshing will clear your cache.

- 🔗 **Shareable Deep Links**  
  Every Roam view is linkable (e.g. `https://arweave.net/TxId`) and social-ready.

- 📱 **Mobile-First PWA**  
  Install it like an app. It works offline and respects bandwidth (no autoplay, lazy loads big files).

- 🔎 **404-Resistant Design**  
  Corrupted or unresponsive content is auto-skipped so you’re never stuck on a dead link.

- 🔍 **NSFW Consent Gate**  
  Arweave has no filters. Roam reminds users of this before they enter.

---

## 🧠 How It Works

Roam runs entirely in the browser. It uses:

- **Goldsky Graphql** via public GraphQL APIs  
- **AR.IO Gateways** for blazing-fast content delivery  
- **TypeScript + Vite** for clean, portable builds

All content is fetched client-side. Roam itself is hosted permanently on Arweave.

---

## 🛠 Developer Notes

### Local Dev

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

Deploy the static /dist folder to any Arweave via ArDrive, ArLink, Permaweb Deploy or any other uploading tool.