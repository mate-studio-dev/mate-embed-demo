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
3. Paste the JSON response into the first box, set the app and API URLs, and click "Load widget".

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
