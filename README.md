# EnvHop - Environment Switcher for Developers

Instantly cycle between environments (Local / Dev / Staging / Prod) for the current site.

## Icons (required for publishing)
This extension expects PNG icons at:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`

Once those files exist, wire them into `manifest.json` under:
- `icons`
- `action.default_icon`

## Quickstart (Unpacked install)

1. Open `chrome://extensions` (Edge: `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `personal-projects/env-switcher`

## How it works

### Switching (configured site)
- Click the extension icon to cycle to the next environment.
- Preserves path and (optionally) query/hash.

Badge meanings:
- `L` Local
- `D` Dev
- `S` Staging
- `P` Prod
- `+` Not configured

### Setup (unconfigured / related site)
- Click the extension icon to open the in-page overlay.
- Click an environment chip to save immediately and close.

Keyboard shortcuts (overlay):
- `1` Local
- `2` Dev
- `3` Staging
- `4` Prod
- `N` New project (only in Related mode)
- `Esc` Close

### Manage / Edit
- Right-click the extension icon → **Manage Environments**
- Or open the Options page from the extension details page

## Notes
- Environment types are currently limited to: `local | development | staging | production`.
- “Related project” detection uses a simple base-domain heuristic.
