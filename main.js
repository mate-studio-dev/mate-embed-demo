const PROTOCOL_VERSION = 1
const $ = (id) => document.getElementById(id)
const frame = $("widget")
const fields = {
  contentUnitId: $("content-unit-id"),
  token: $("token"),
  sessionExpiresAt: $("session-expires-at"),
  locale: $("locale"),
  appUrl: $("app-url"),
  apiUrl: $("api-url"),
  templateId: $("template-id"),
  environment: $("environment"),
}

let widgetOrigin = null
let tokenExpiresAt = null
let initSent = false

$("own-origin").textContent = window.location.origin

// Every page of the demo shares one origin, so these fields survive a tab switch.
const STORAGE_KEY = "mate-embed-demo-session"
const PERSISTED_FIELDS = ["token", "sessionExpiresAt", "locale", "appUrl", "apiUrl"]

function saveSession() {
  const saved = Object.fromEntries(PERSISTED_FIELDS.map((name) => [name, fields[name].value]))
  saved.tokenExpiresAt = tokenExpiresAt?.toISOString() ?? null
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
}

function restoreSession() {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return
  }
  if (!saved) return

  for (const name of PERSISTED_FIELDS) {
    if (saved[name] !== undefined) fields[name].value = saved[name]
  }
  tokenExpiresAt = saved.tokenExpiresAt ? new Date(saved.tokenExpiresAt) : null
}

restoreSession()
for (const name of PERSISTED_FIELDS) fields[name].addEventListener("change", saveSession)

const ENVIRONMENTS = {
  staging: { appUrl: "https://app-staging.mate-studio.com", apiUrl: "https://api-staging.mate-studio.com" },
  production: { appUrl: "https://app.mate-studio.com", apiUrl: "https://api.mate-studio.com" },
  development: { appUrl: "https://app.lvh.me", apiUrl: "https://api.lvh.me" },
}

function normalizeUrl(value) {
  return value.trim().replace(/\/$/, "")
}

// The picker is derived from the two URLs, so it also reads right after a restore or a manual edit.
function syncEnvironment() {
  const appUrl = normalizeUrl(fields.appUrl.value)
  const apiUrl = normalizeUrl(fields.apiUrl.value)
  const match = Object.entries(ENVIRONMENTS).find(([, urls]) => urls.appUrl === appUrl && urls.apiUrl === apiUrl)
  fields.environment.value = match ? match[0] : "custom"
}

fields.environment.addEventListener("change", () => {
  const urls = ENVIRONMENTS[fields.environment.value]
  if (!urls) return
  fields.appUrl.value = urls.appUrl
  fields.apiUrl.value = urls.apiUrl
  saveSession()
  renderSummaries()
})
for (const field of [fields.appUrl, fields.apiUrl]) field.addEventListener("input", syncEnvironment)
syncEnvironment()

function log(kind, text, data) {
  const line = document.createElement("div")
  line.className = kind
  const time = new Date().toLocaleTimeString()
  const arrow = { in: "widget -> host", out: "host -> widget", err: "error", info: "info" }[kind]
  line.textContent = `${time}  ${arrow}  ${text}${data === undefined ? "" : `  ${JSON.stringify(data)}`}`
  $("log").append(line)
  $("log").scrollTop = $("log").scrollHeight
}

// The browser blocks `window.open` once the widget click is a few seconds old, so the log also gets a link per file.
function logExportLinks(urls) {
  log("info", `Export ready, ${urls.length} file(s). Open them here if no tab opened:`)
  for (const url of urls) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      log("err", "export:done has an invalid url")
      continue
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      log("err", "export:done url is not http(s)")
      continue
    }

    log("info", "")
    const link = document.createElement("a")
    link.href = parsed.href
    link.target = "_blank"
    link.rel = "noopener"
    link.textContent = parsed.href
    $("log").lastChild.append(link)
  }
}

function applySession(body) {
  if (body.contentUnitId && fields.contentUnitId) fields.contentUnitId.value = body.contentUnitId
  if (body.sessionExpiresAt) fields.sessionExpiresAt.value = body.sessionExpiresAt
  if (body.token) {
    fields.token.value = body.token
    tokenExpiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  }
  saveSession()
  renderStatus()
}

// Matches a string with an optional key colon, a number, or a literal. An unclosed string still matches while the user types.
const JSON_TOKEN = /("(?:\\.|[^"\\])*"?)(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g

function span(kind, text) {
  const node = document.createElement("span")
  node.className = `json-${kind}`
  node.textContent = text
  return node
}

function highlightResponse() {
  const text = $("create-response").value
  const nodes = []
  let last = 0
  for (const match of text.matchAll(JSON_TOKEN)) {
    nodes.push(text.slice(last, match.index))
    if (match[1]) {
      nodes.push(span(match[2] ? "key" : "string", match[1]), match[2] ?? "")
    } else {
      nodes.push(span("literal", match[0]))
    }
    last = match.index + match[0].length
  }
  // The extra newline keeps a trailing empty line as tall as the one in the textarea.
  $("create-response-highlight").replaceChildren(...nodes, text.slice(last), "\n")
}

$("create-response").addEventListener("input", highlightResponse)
$("create-response").addEventListener("scroll", (event) => {
  $("create-response-highlight").scrollTop = event.target.scrollTop
})

$("create-response").addEventListener("input", (event) => {
  try {
    applySession(JSON.parse(event.target.value))
    log("info", "Filled the fields from the pasted response")
  } catch {
    // Ignore partial JSON while the user is still pasting.
  }
})

// The widget accepts messages only from `host_origin`, and this page posts only to the widget's origin.
function post(message) {
  if (!widgetOrigin || !frame.contentWindow) return log("err", "No widget loaded")
  const payload = { ...message, version: PROTOCOL_VERSION }
  frame.contentWindow.postMessage(payload, widgetOrigin)
  log("out", message.type, redact(payload))
}

function redact(message) {
  if (!message.token) return message
  return { ...message, token: `${message.token.slice(0, 6)}...` }
}

function sessionExpiresAt() {
  return fields.sessionExpiresAt.value.trim() || undefined
}

function sendInit() {
  post({
    type: "init",
    token: fields.token.value.trim(),
    locale: fields.locale.value,
    sessionExpiresAt: sessionExpiresAt(),
  })
  initSent = true
}

function sendTokenUpdated() {
  post({ type: "token:updated", token: fields.token.value.trim(), sessionExpiresAt: sessionExpiresAt() })
}

async function refresh() {
  const url = `${fields.apiUrl.value.replace(/\/$/, "")}/embed/sessions/refresh`
  log("info", `POST ${url}`)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${fields.token.value.trim()}` },
      credentials: "omit",
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return log("err", `Refresh failed with ${response.status}`, body)

    applySession(body)
    log("info", "Refresh returned a new token", { expiresAt: body.expiresAt, sessionExpiresAt: body.sessionExpiresAt })
    sendTokenUpdated()
  } catch (error) {
    log("err", `Refresh request failed: ${error.message}`)
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== widgetOrigin) return
  const message = event.data
  log("in", message?.type ?? "(no type)", message)

  switch (message?.type) {
    case "ready":
      // The widget sends `ready` on every load, so this also answers a reload inside the iframe.
      sendInit()
      break
    case "refresh:requested":
      if ($("auto-refresh").checked) refresh()
      else log("info", "Auto refresh is off, so the request goes unanswered")
      break
    case "close":
      unloadWidget("Widget asked to close, so the iframe is unloaded")
      break
    case "export:done":
      logExportLinks(message.urls)
      window.open(message.urls[0], "_blank", "noopener")
      break
  }
})

$("load").addEventListener("click", () => {
  // The gallery and template pages have no contentUnitId field: their sessions are minted with a workspace only.
  const contentUnitId = fields.contentUnitId?.value.trim()
  if (fields.contentUnitId && !contentUnitId) return log("err", "Fill in contentUnitId first")
  const templateId = fields.templateId?.value.trim()
  if (fields.templateId && !templateId) return log("err", "Fill in templateId first")
  if (!fields.token.value.trim()) return log("err", "Fill in the session token first")

  let appUrl
  try {
    appUrl = new URL(fields.appUrl.value.trim())
  } catch {
    return log("err", "The Mate app URL is not a valid URL")
  }

  widgetOrigin = appUrl.origin
  initSent = false
  const params = new URLSearchParams({ host_origin: window.location.origin })
  if (contentUnitId) params.set("content_unit_id", contentUnitId)
  for (const name of ["view", "open"]) {
    const value = $(name)?.value
    if (value) params.set(name, value)
  }
  const widgetPath = templateId
    ? `/embed/${encodeURIComponent(templateId)}`
    : (document.body.dataset.widgetPath ?? "/embed/editor")
  frame.src = `${widgetOrigin}${widgetPath}?${params}`
  log("info", `Loading ${frame.src}`)
})

function unloadWidget(reason) {
  frame.removeAttribute("src")
  widgetOrigin = null
  initSent = false
  log("info", reason)
}

$("unload").addEventListener("click", () => unloadWidget("Unloaded the widget"))

$("refresh-now").addEventListener("click", refresh)
$("send-token").addEventListener("click", () => {
  if (!initSent) return log("err", "The widget has not sent ready yet")
  sendTokenUpdated()
})

// An empty width or height means "fill that dimension of the stage".
// Saved per mode: a size that suits the preview card would be too small for the editor.
const SIZE_STORAGE_KEY = `mate-embed-demo-size-${document.body.dataset.mode}`
const frameBox = $("frame-box")
const sizeInputs = { width: $("width"), height: $("height") }
const sizePresets = document.querySelectorAll(".size-preset")

function applySize() {
  const width = Number(sizeInputs.width.value) || null
  const height = Number(sizeInputs.height.value) || null
  frameBox.style.width = width ? `${width}px` : ""
  frameBox.style.height = height ? `${height}px` : ""
  for (const preset of sizePresets) {
    const matches = (Number(preset.dataset.width) || null) === width && (Number(preset.dataset.height) || null) === height
    preset.classList.toggle("active", matches)
  }
  localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify({ width, height }))
}

for (const preset of sizePresets) {
  preset.addEventListener("click", () => {
    sizeInputs.width.value = preset.dataset.width
    sizeInputs.height.value = preset.dataset.height
    applySize()
  })
}
for (const input of Object.values(sizeInputs)) input.addEventListener("input", applySize)

function restoreSize() {
  const defaultPreset = document.querySelector(".size-preset[data-default]")
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(SIZE_STORAGE_KEY))
  } catch {
    // A corrupt entry falls back to the default preset.
  }
  sizeInputs.width.value = saved ? (saved.width ?? "") : defaultPreset.dataset.width
  sizeInputs.height.value = saved ? (saved.height ?? "") : defaultPreset.dataset.height
}

restoreSize()
applySize()

// The label and the empty-field placeholders show the size the widget really gets, also in "fill" mode.
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width)
  const height = Math.round(entry.contentRect.height)
  $("size-label").textContent = `${width} × ${height}`
  sizeInputs.width.placeholder = String(width)
  sizeInputs.height.placeholder = String(height)
}).observe(frameBox)

function renderStatus() {
  const lines = []
  let state = "ok"
  if (!fields.token.value.trim()) {
    lines.push("No session yet")
    state = "none"
  } else if (!tokenExpiresAt) {
    lines.push("Token set, expiry unknown")
    state = "none"
  } else {
    const minutes = Math.round((tokenExpiresAt - Date.now()) / 60000)
    lines.push(minutes > 0 ? `Token expires in ${minutes} min` : "Token expired")
    if (minutes <= 0) state = "bad"
    else if (minutes <= 5) state = "warn"
  }

  const ceiling = sessionExpiresAt()
  if (ceiling && !Number.isNaN(Date.parse(ceiling))) {
    const hours = (Date.parse(ceiling) - Date.now()) / 3600000
    lines.push(hours > 0 ? `session ends in ${hours.toFixed(1)} h` : "session ended")
    if (hours <= 0) state = "bad"
  }

  $("status").textContent = lines.join(" · ")
  $("status").dataset.state = state
}

function hostOf(value) {
  try {
    return new URL(value.trim()).host
  } catch {
    return value.trim() || "not set"
  }
}

function renderSummaries() {
  $("endpoints-summary").textContent = `${hostOf(fields.appUrl.value)} · ${hostOf(fields.apiUrl.value)}`
  $("refresh-summary").textContent = $("auto-refresh").checked ? "auto-refresh on" : "auto-refresh off"
}

for (const field of [fields.token, fields.sessionExpiresAt, fields.appUrl, fields.apiUrl, $("auto-refresh")]) {
  field.addEventListener("input", () => {
    renderStatus()
    renderSummaries()
  })
}
renderSummaries()
renderStatus()
setInterval(renderStatus, 1000)
