# koi-pond

A calm pixel-art koi pond behind your Claude Code conversation (desktop app).

- Three koi with segmented, naturally bending bodies swimming slow loops
- Sparse lily pads, reeds and ripples
- Automatic feeding: sending a message or finishing a turn drops food pellets at the edges of the window, and the koi swim over to eat them
- `/pond on` and `/pond off` to toggle

## Install

```bash
claude plugin marketplace add /path/to/this/repo
claude plugin install koi-pond@local-mods
```

Then run `/reload-plugins` in the app and start a session. The pond appears once a session starts, not on the empty new-session page.

## Layout

- `koi-pond/hooks/register.tsx` is the whole mod: scene, koi physics, feeding
- `koi-pond/hooks/hooks.json` and `koi-pond/.claude-plugin/plugin.json` are the manifests
- `.claude-plugin/marketplace.json` makes this folder installable as a local marketplace
