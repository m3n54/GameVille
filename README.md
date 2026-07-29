# 🎮 GameVille — Multiplayer Web Game Platform

Platform multiplayer web game realtime buat main bareng teman! 🐍💀⚓

## Games

| Game | Pemain | Deskripsi |
|------|--------|-----------|
| 🐍 **Ular Tangga** | 2–4 | Papan 3D isometric, dadu 3D, lempar dan naik/turun |
| 💀 **Hangman** | 2–4 | Tebak kata bareng-bareng, co-op mode |
| ⚓ **Sea Battle** | 2 | Perang kapal di grid, tembak koordinat lawan |

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Three.js (@react-three/fiber), Socket.io
- **Backend:** Node.js, Express, Socket.io, TypeScript
- **Hosting:** Vercel (FE) + Render (BE)

## Development

```bash
# Server
cd server
npm install
npm run dev    # → http://localhost:3001

# Client (terminal lain)
cd frontend
npm install
npm run dev    # → http://localhost:3000
```

## Structure

```
frontend/   → Next.js 14 App Router (player UI + 3D games)
server/     → Express + Socket.io (room & game logic)
shared/     → TypeScript types (FE + BE)
```
