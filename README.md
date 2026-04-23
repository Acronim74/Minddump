# MindDump Structure

This project uses a simple static structure:

- `index.html` - app markup, screen containers, and script/style links
- `manifest.json` - PWA manifest
- `sw.js` - service worker for basic offline cache
- `icons/` - PWA icons (`icon-192.png`, `icon-512.png`)

## CSS

All styles are split by responsibility in `css/`:

- `base.css` - global variables, layout, nav, and today screen basics
- `month.css` - month screen styles
- `future.css` - future log styles
- `collections.css` - collections screen styles
- `modals.css` - modal and menu styles
- `settings.css` - settings screen styles
- `responsive.css` - desktop/tablet responsive rules

## JavaScript

All logic is split by responsibility in `js/`:

- `core.js` - app state, date/util helpers, IndexedDB API
- `screens.js` - today/month/settings render and navigation bindings
- `collections.js` - collections render and collection-specific events
- `future.js` - future log render and events
- `modals.js` - entry modal and entry context menu behavior
- `main.js` - app startup, demo seed, and service worker registration

## Load Order

Scripts in `index.html` are loaded in this order and should stay in this order:

1. `js/core.js`
2. `js/screens.js`
3. `js/collections.js`
4. `js/future.js`
5. `js/modals.js`
6. `js/main.js`
