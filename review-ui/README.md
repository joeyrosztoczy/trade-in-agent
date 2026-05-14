# Trade-In Review UI Design System

This folder is the first review UI scaffold for the used-equipment trade desk. It turns the `concept-1-field-office.html` direction into reusable tokens, component classes, and a data-driven demo.

The goal is to keep the design portable. Most future migration work should be moving these tokens and component names into the eventual app framework, not re-deciding the visual language.

## Structure

- `index.html` loads the demo shell.
- `src/styles/tokens.css` owns color, type, spacing, radius, shadow, status, and density tokens.
- `src/styles/base.css` owns reset, body, focus, and responsive base behavior.
- `src/styles/components.css` owns reusable UI primitives.
- `src/styles/demo.css` owns only demo-page composition.
- `src/demo-data.js` is structured mock trade-review data.
- `src/demo.js` renders the demo from that data.

## Local Preview

```bash
cd review-ui
npm run start
```

Then open:

```text
http://127.0.0.1:5177
```

For a lightweight static QA check:

```bash
npm run smoke
```

## Migration Notes

When this moves into the product app:

1. Keep `tokens.css` as the source of truth or map it directly into the app token system.
2. Convert the component classes into framework components one at a time.
3. Replace `src/demo-data.js` with sidecar API data, keeping the same view-model shape where possible.
4. Treat `demo.css` as disposable page composition. Treat `tokens.css` and `components.css` as durable.

