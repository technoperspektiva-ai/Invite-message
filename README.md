# Sweet Wife Invitation — test build

Static animated invitation for Cloudflare Workers Static Assets.

## Local test
```bash
npm install
npm run dev
```

## Deploy
```bash
npx wrangler login
npm run deploy
```

Main interaction: tap/click the pink envelope or the button. The flap opens, the invitation rises, then a full-screen readable invitation appears.

## Fix 2026-09-19
- Invitation card is fully hidden while the envelope is closed.
- Card only becomes visible after the flap starts opening, so it no longer sticks out behind the envelope.
- Envelope proportions were slightly corrected for mobile.
