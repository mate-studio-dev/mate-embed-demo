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
