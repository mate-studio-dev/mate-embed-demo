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
}

let widgetOrigin = null
let tokenExpiresAt = null
let initSent = false

$("own-origin").textContent = window.location.origin

function log(kind, text, data) {
  const line = document.createElement("div")
  line.className = kind
  const time = new Date().toLocaleTimeString()
  const arrow = { in: "widget -> host", out: "host -> widget", err: "error", info: "info" }[kind]
  line.textContent = `${time}  ${arrow}  ${text}${data === undefined ? "" : `  ${JSON.stringify(data)}`}`
  $("log").append(line)
  $("log").scrollTop = $("log").scrollHeight
}

// The browser blocks `window.open` once the widget click is a few seconds old, so the log also gets a link.
function logExportLink(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return log("err", "export:done has no valid url")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return log("err", "export:done url is not http(s)")

  log("info", "Export ready, open it here if no tab opened:")
  const link = document.createElement("a")
  link.href = parsed.href
  link.target = "_blank"
  link.rel = "noopener"
  link.textContent = parsed.href
  $("log").lastChild.append("  ", link)
}

function applySession(body) {
  if (body.contentUnitId) fields.contentUnitId.value = body.contentUnitId
  if (body.sessionExpiresAt) fields.sessionExpiresAt.value = body.sessionExpiresAt
  if (body.token) {
    fields.token.value = body.token
    tokenExpiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  }
}

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
      logExportLink(message.url)
      window.open(message.url, "_blank", "noopener")
      break
  }
})

$("load").addEventListener("click", () => {
  const contentUnitId = fields.contentUnitId.value.trim()
  if (!contentUnitId || !fields.token.value.trim()) return log("err", "Fill in contentUnitId and the session token first")

  let appUrl
  try {
    appUrl = new URL(fields.appUrl.value.trim())
  } catch {
    return log("err", "The Mate app URL is not a valid URL")
  }

  widgetOrigin = appUrl.origin
  initSent = false
  const params = new URLSearchParams({ host_origin: window.location.origin, content_unit_id: contentUnitId })
  frame.src = `${widgetOrigin}/embed/editor?${params}`
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

setInterval(() => {
  const lines = []
  if (tokenExpiresAt) {
    const minutes = Math.round((tokenExpiresAt - Date.now()) / 60000)
    lines.push(minutes > 0 ? `Token expires in ${minutes} min` : "Token expired")
  }
  const ceiling = sessionExpiresAt()
  if (ceiling && !Number.isNaN(Date.parse(ceiling))) {
    const hours = (Date.parse(ceiling) - Date.now()) / 3600000
    lines.push(hours > 0 ? `Session ends in ${hours.toFixed(1)} h` : "Session ended")
  }
  $("status").innerHTML = lines.map((line) => `<span>${line}</span>`).join("")
}, 1000)
