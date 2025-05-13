
# Contributing to Roam

Thanks for your interest in contributing to **Roam** — a retro-futuristic, mobile-first app for discovering random Arweave content across the Permaweb.  
We welcome contributions of all kinds: code, issues, feedback, design, docs, and ideas.

---

## 🧠 What is Roam?

Roam is a channel-surfing interface for the Permaweb. It lets users discover random Arweave content by media type (images, music, video, text, websites, or anything), with privacy controls, zoom overlays, and a shareable experience.

Roam is:

- 🔥 100% client-side
- 📱 Optimized for mobile
- 🌌 Designed with a retro, vaporwave aesthetic
- ⚡ Built with [Preact](https://preactjs.com/) + [TypeScript](https://www.typescriptlang.org/)

---

## 🛠 Tech Stack

- `Preact` w/ hooks
- `TypeScript`
- CSS Modules (Vanilla CSS, no preprocessors)
- Arweave GraphQL & gateway APIs
- Hosted on AR.IO gateway via ArNS

---

## 🧑‍💻 Ways to Contribute

| Type | How |
|------|-----|
| 💡 Feature ideas | [Open a new issue](https://github.com/your-org/roam/issues/new) with `[Feature Request]` |
| 🐛 Bug reports | Create an issue describing what’s broken and how to reproduce |
| 💅 UI fixes or polish | Fork, tweak styles, and submit a PR |
| 🧩 New media handler | Extend `MediaView.tsx` to support additional formats |
| 🔌 Plugin ideas | Suggest integrations (e.g., ENS, IPFS gateways, AO scripts, etc.) |
| 📢 Promotion help | Create banners, memes, infographics, or content for socials |
| 🌐 Translations | Help us make Roam multilingual |
| 📄 Docs | Help improve or simplify this README and internal dev notes |

---

## 📁 Project Structure

```bash
src/
├── components/     # UI components (MediaView, ZoomOverlay, etc)
├── engine/         # Core logic for queueing, fetching, history
├── hooks/          # Custom hooks
├── styles/         # All CSS modules
├── constants.ts    # App-wide constants
├── App.tsx         # Main app entry point
```

---

## 🔧 Setup Instructions

1. **Clone the repo**  
   ```bash
   git clone https://github.com/vilenarios/roam.git
   cd roam
   ```

2. **Install dependencies**  
   ```bash
   npm install
   ```

3. **Run locally**  
   ```bash
   npm run dev
   ```

4. **Build for production**  
   ```bash
   npm run build
   ```

---

## ✅ Pull Request Checklist

Before submitting a PR:

- [ ] Your code runs locally without errors
- [ ] Your PR description clearly explains the "why" and the "what"
- [ ] You included screenshots or videos (if UI related)
- [ ] You ran `npm run lint` and fixed issues
- [ ] You tested any new functionality on both mobile and desktop

---

## 📬 Feedback & Support

- File an [issue](https://github.com/vilenarios/roam/issues)
- Ping us on X: [@RoamThePermaweb](https://x.com/RoamThePermaweb)
- Want to build something with Roam? DM us or open a discussion!

---

## 💥 Code of Conduct

We are kind, curious, and constructive. Roam is built for the weird permanent web — not a toxic one. Be respectful and helpful, or take your vibes elsewhere.

---

**Let's Roam the Permaweb together.**  
`⚡ Discover. Share. Repeat.`
