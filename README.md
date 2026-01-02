# Environment Switcher (Chrome Extension)

A fast, developer-focused environment switcher:

- **Configured site**: click the extension icon → **cycles** environments (Local → Dev → Staging → Prod …) with path/query/hash preservation.
- **Unconfigured / related site**: click the icon → an **in-page command overlay** appears to add the site as a new project or add it to an existing related project.
- **Management**: use the **Options page** (or the action context menu) to edit projects/environments, settings, and export/import config.

---

## Install / Run (Unpacked)

1. Open `chrome://extensions` (Edge: `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `personal-projects/env-switcher`

---

## UX Flows

### 1) Switching (configured site)
When the current site host matches a configured project environment:

- Click extension icon → navigates to the **next** environment URL
- Preserves:
  - Path (`/foo/bar`)
  - Query (`?x=1`)
  - Hash (`#section`)
  - based on settings in storage

Badge shows environment:
- `L` Local
- `D` Development
- `S` Staging
- `P` Production

### 2) Setup (unconfigured site)
When the current site is not configured:

- Click extension icon → injects an **on-page overlay** (top-right “command center” UI).
- Choose environment (click-to-save):
  - Saves immediately
  - Shows success feedback
  - Closes overlay automatically

Keyboard shortcuts in overlay:
- `1` Local
- `2` Dev
- `3` Staging
- `4` Prod
- `N` New project (only when “Related” mode is shown)
- `Esc` close
- `Enter` selects the currently active chip

### 3) Related project detection
If the host is not mapped but the **base domain** matches an existing project, the overlay shows a **Related** mode.

- Selecting an env adds this origin as a new environment in the existing project.
- `New project` creates a new project instead.

> Note: base-domain extraction currently uses a “last 2 labels” heuristic (e.g., `example.com`). Multi-part TLDs like `co.uk` may not match as expected.

---

## Options Page (Management)

Open via:
- Right-click extension icon → **Manage Environments**
- or Chrome extensions page → Extension details → **Extension options**

From options you can:
- Delete projects
- Add environments
- Edit environment URL/type
- Remove environments
- Configure URL preservation settings
- Export configuration
- Import configuration

---

## Storage Schema (chrome.storage.local)

The extension stores all data in `chrome.storage.local`:

### `projects`
A map keyed by `projectId`.

Example shape:

```json
{
  "projects": {
    "uuid-123": {
      "id": "uuid-123",
      "name": "Example",
      "baseDomain": "example.com",
      "createdAt": 1710000000000,
      "environments": [
        {
          "type": "production",
          "url": "https://example.com",
          "name": "Production",
          "badge": "P",
          "color": "#4CAF50",
          "icon": "🚀",
          "order": 0
        }
      ]
    }
  }
}
```

### `urlMapping`
A map of `host` → `projectId`.  
Both `host` and `hostWithoutPort` are stored to reduce port-friction.

Example:

```json
{
  "urlMapping": {
    "example.com": "uuid-123",
    "localhost:3000": "uuid-123",
    "localhost": "uuid-123"
  }
}
```

### `settings`
Controls switch behavior:

- `preserveQueryParams` (default `true`)
- `preserveHash` (default `true`)
- `showToastNotifications` (stored for future use)

---

## Permissions Rationale

From `manifest.json`:

- `storage`  
  Persist projects/environments/settings.
- `tabs`, `activeTab`  
  Read current tab URL and navigate to target environment.
- `contextMenus`  
  Provide a management entrypoint (open options).
- `scripting`  
  Inject the overlay host script for the setup UI.
- `host_permissions: ["<all_urls>"]`  
  Required to inject the overlay on arbitrary sites.

---

## File Structure (high level)

- `background.js`  
  Service worker: switching logic, badge updates, injection trigger, context menu.
- `content/overlay-host.js`  
  Injected host: mounts iframe overlay + handles close/resize messages.
- `overlay/`  
  Overlay UI (HTML/CSS/JS). Click-to-save + keyboard shortcuts.
- `options/`  
  Management UI for projects/environments/settings/export/import.
- `popup/`, `setup/`  
  Legacy/experimental UI assets kept in repo; switching uses the overlay + options flow.

---

## Notes / Known Constraints

- Related project detection is heuristic-based and may not handle all public suffixes.
- Custom environment types are not supported; types are currently limited to:
  `local | development | staging | production`.
