# Mate embed demo

A host page that embeds the Mate editor widget in an iframe, for testing by hand.

## Usage

1. Run `python3 -m http.server 8099` or `pnpm dlx serve -l 8099` in this folder and open http://localhost:8099. Opening `index.html` as a file does not work.
2. Create a session with `POST /embed/sessions` (curl or Postman, never in this page).
  ```bash
  curl -X POST https://<mate-api-host>/embed/sessions \
    -H "Authorization: Bearer <API_KEY>" \
    -H "Content-Type: application/json" \
    -d '{"workspaceId": "<WORKSPACE_ID>", "contentTemplateId": "<CONTENT_TEMPLATE_ID>"}'
  ```
3. Paste the JSON response into the session box, pick the environment (Staging is the default, then Production or Development), and click "Load widget". The picker fills the app and API URLs. Open "Endpoints" to edit them, which switches the picker to Custom. The token and `sessionExpiresAt` fields sit behind the status line under the box.

The log at the bottom shows every message between the page and the widget.

## Template gallery

Open http://localhost:8099/gallery.html to embed `/embed/gallery`, which lists the templates the session's workspace can open. Create the session with the workspace only, so the response has `"contentUnitId": null`:

```bash
curl -X POST https://<mate-api-host>/embed/sessions \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "<WORKSPACE_ID>"}'
```

Then paste the response and click "Load widget", as above. The page shares `main.js` with the editor demo and reads the widget path from `data-widget-path` on `<body>`.

## Widget size

The size bar above the iframe resizes the box around the widget, so you can see how it responds. Pick a preset or type a width and height. An empty field fills that side of the stage. The dashed outline and the label show the size the widget gets. The session fields and the size survive a page switch through `localStorage`.

The size is saved per tab. The Editor and Gallery tabs start on Fill. The Template tab starts on Small card. Its presets are one square card (200, 300 or 400px wide) plus the widget's 16px padding and the title row, so the card fills the box.

## Template preview

Open http://localhost:8099/template.html to embed `/embed/<templateId>`, which shows one template card. A click opens the template in place. Set `open` to `host` to keep the widget on the card: a click then sends `template:selected` to the page, and the log shows it. Fill in `templateId` and use a session created with the workspace only, as for the gallery. The widget route needs the `/embed/:templateId` page from mate-frontend PR #3318.
