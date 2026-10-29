var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
__name(json, "json");
function normalizePhone(raw) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}
__name(normalizePhone, "normalizePhone");
function applyMergeTags(message, name) {
  const firstName = (name || "").trim().split(/\s+/)[0] || "there";
  return (message || "").replace(/\{\{\s*first_name\s*\}\}/gi, firstName).replace(/\{\{\s*name\s*\}\}/gi, name || "there");
}
__name(applyMergeTags, "applyMergeTags");
async function getKV(env, key, fallback) {
  const raw = await env.SUBSCRIBERS_KV.get(key);
  if (raw === null || raw === void 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
__name(getKV, "getKV");
async function putKV(env, key, value) {
  await env.SUBSCRIBERS_KV.put(key, JSON.stringify(value));
}
__name(putKV, "putKV");
async function getSubscribers(env) {
  const data = await getKV(env, "subscribers", { subscribers: [] });
  return Array.isArray(data.subscribers) ? data.subscribers : [];
}
__name(getSubscribers, "getSubscribers");
async function saveSubscribers(env, list) {
  await putKV(env, "subscribers", { subscribers: list });
}
__name(saveSubscribers, "saveSubscribers");
async function sendTwilioSms(env, to, body, mediaUrl) {
  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", env.TWILIO_FROM_NUMBER);
  if (body) params.set("Body", body);
  if (mediaUrl) params.set("MediaUrl", mediaUrl);
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, data: { error: e.message } };
  }
}
__name(sendTwilioSms, "sendTwilioSms");
function checkAuth(request, env) {
  const token = request.headers.get("X-Admin-Token") || "";
  return Boolean(token) && (token === env.ADMIN_TOKEN || token === env.PAYMENT_HUB_TOKEN);
}
__name(checkAuth, "checkAuth");
var RICKPARMA_CALENDAR_ID = "ee79e1557e817dd0e6986fac5545e97cf36f3a9537862731c7e9adc12ea58186@group.calendar.google.com";
var RICKPARMA_CALENDAR_API_KEY = "AIzaSyCea0FN28V6xlJtKaKYJhwLI3xa9v8Pr6s";
async function getUpcomingShows() {
  const params = new URLSearchParams({
    key: RICKPARMA_CALENDAR_API_KEY,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
    timeMin: (/* @__PURE__ */ new Date()).toISOString()
  });
  const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(RICKPARMA_CALENDAR_ID)}/events?${params}`;
  const response = await fetch(calendarUrl, {
    headers: { Accept: "application/json", Referer: "https://rickparma.com/" },
    cf: { cacheTtl: 120, cacheEverything: false }
  });
  if (!response.ok) throw new Error("RickParma.com calendar is unavailable right now.");
  const data = await response.json();
  return (Array.isArray(data.items) ? data.items : []).filter((event) => event.status !== "cancelled").map((event) => ({
    id: event.id,
    title: event.summary || "Rick Parma Live",
    location: event.location || "",
    description: event.description || "",
    start: event.start && (event.start.dateTime || event.start.date) || "",
    end: event.end && (event.end.dateTime || event.end.date) || "",
    url: event.htmlLink || ""
  }));
}
__name(getUpcomingShows, "getUpcomingShows");
function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  const texts = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content.type === "output_text" && typeof content.text === "string") texts.push(content.text);
    }
  }
  return texts.join("\n").trim();
}
__name(extractResponseText, "extractResponseText");
async function writeBlastWithAI(env, prompt, event) {
  if (!env.openai_api_key) throw new Error("AI writer is not configured.");
  const eventContext = event ? `\nSelected RickParma.com calendar event:\n${JSON.stringify(event)}` : "\nNo calendar event was selected.";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openai_api_key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      store: false,
      max_output_tokens: 300,
      instructions: "Write one ready-to-send SMS blast in Rick Parma's friendly first-person voice. Return only the message, with no label, quotation marks, or commentary. Use only facts supplied in the request. Never invent a venue, date, time, price, link, booking detail, or offer. Keep it concise, usually under 320 characters. Plain text only: no emoji, smart quotes, or em dashes. You may use {{first_name}} when it feels natural. Include a clear call to action. If a calendar event is supplied, accurately promote that show. If no event is supplied, follow the custom request.",
      input: `Custom request: ${prompt || "Write an inviting announcement for the selected show."}${eventContext}`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error && data.error.message || "The AI writer could not create a draft.");
  const draft = extractResponseText(data);
  if (!draft) throw new Error("The AI writer returned an empty draft.");
  return draft;
}
__name(writeBlastWithAI, "writeBlastWithAI");
async function handleInboundSms(request, env) {
  const form = await request.formData();
  const from = normalizePhone(form.get("From") || "");
  const body = (form.get("Body") || "").trim();
  const numMedia = parseInt(form.get("NumMedia") || "0", 10) || 0;
  const mediaUrl0 = numMedia > 0 ? form.get("MediaUrl0") : null;
  if (from) {
    const conversations = await getKV(env, "conversations", {});
    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({
      dir: "in",
      body,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      ...mediaUrl0 ? { media: mediaUrl0 } : {}
    });
    const upper = body.toUpperCase();
    const subscribers = await getSubscribers(env);
    const sub = subscribers.find((s) => s.phone === from);
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper)) {
      if (sub) {
        sub.status = "stopped";
        sub.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await saveSubscribers(env, subscribers);
      }
    } else if (["START", "YES", "UNSTOP"].includes(upper)) {
      if (sub) {
        sub.status = "active";
        sub.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await saveSubscribers(env, subscribers);
      }
    } else {
      const rules = await getKV(env, "autorules", []);
      const rule = rules.find((r) => (r.keyword || "").trim().toUpperCase() === upper);
      if (rule) {
        const sendResult = await sendTwilioSms(env, from, rule.response);
        if (sendResult.ok) {
          conversations[from].push({
            dir: "out",
            body: rule.response,
            at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    }
    await putKV(env, "conversations", conversations);
  }
  return new Response("<Response></Response>", {
    headers: { "Content-Type": "text/xml" }
  });
}
__name(handleInboundSms, "handleInboundSms");
function computeNextRun(recurrence, from) {
  if (!recurrence || !recurrence.freq) return null;
  const parts = (recurrence.time || "09:00").split(":").map(Number);
  const hh = parts[0], mm = parts[1];
  let next = new Date(from);
  next.setSeconds(0, 0);
  if (recurrence.freq === "daily") {
    next.setHours(hh, mm, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
  } else if (recurrence.freq === "weekly") {
    const targetDay = typeof recurrence.dayOfWeek === "number" ? recurrence.dayOfWeek : from.getDay();
    next.setHours(hh, mm, 0, 0);
    let diff = (targetDay - next.getDay() + 7) % 7;
    if (diff === 0 && next <= from) diff = 7;
    next.setDate(next.getDate() + diff);
  } else if (recurrence.freq === "monthly") {
    const targetDate = typeof recurrence.dayOfMonth === "number" ? recurrence.dayOfMonth : from.getDate();
    next.setHours(hh, mm, 0, 0);
    next.setDate(targetDate);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDate);
    }
  } else {
    return null;
  }
  return next;
}
__name(computeNextRun, "computeNextRun");
async function runDueScheduledBlasts(env) {
  const list = await getKV(env, "scheduled_blasts", []);
  const now = /* @__PURE__ */ new Date();
  let changed = false;
  for (const item of list) {
    if (item.status !== "pending") continue;
    if (!item.nextRun || new Date(item.nextRun) > now) continue;
    changed = true;
    const subscribers = await getSubscribers(env);
    const active = subscribers.filter((s) => s.status === "active");
    const base = Array.isArray(item.tags) && item.tags.length ? active.filter((s) => (s.tags || []).some((t) => item.tags.includes(t))) : active;
    const basePhones = new Set(base.map((s) => s.phone));
    const extras = (Array.isArray(item.extraNumbers) ? item.extraNumbers : []).filter((n) => !basePhones.has(n)).map((n) => ({ phone: n, name: "", tags: [] }));
    const recipients = [...base, ...extras];
    let sentCount = 0;
    let failedCount = 0;
    for (const r of recipients) {
      const personalized = applyMergeTags(item.message, r.name);
      const result = await sendTwilioSms(env, r.phone, personalized, item.mediaUrl || void 0);
      if (result.ok) sentCount++;
      else failedCount++;
    }
    const blastlog = await getKV(env, "blastlog", []);
    blastlog.unshift({
      id: "sched_" + item.id + "_" + Date.now(),
      at: (/* @__PURE__ */ new Date()).toISOString(),
      message: item.message,
      mediaUrl: item.mediaUrl || null,
      segmentLabel: item.segmentLabel || null,
      sent: sentCount,
      failed: failedCount,
      scheduled: true
    });
    await putKV(env, "blastlog", blastlog);
    item.lastRunAt = (/* @__PURE__ */ new Date()).toISOString();
    if (item.recurrence) {
      const next = computeNextRun(item.recurrence, now);
      item.nextRun = next ? next.toISOString() : null;
      if (!item.nextRun) item.status = "canceled";
    } else {
      item.status = "sent";
    }
  }
  if (changed) await putKV(env, "scheduled_blasts", list);
}
__name(runDueScheduledBlasts, "runDueScheduledBlasts");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (request.method === "POST" && contentType.includes("application/x-www-form-urlencoded")) {
      return handleInboundSms(request, env);
    }
    if (request.method === "GET" && path.startsWith("/media/")) {
      const id = path.slice("/media/".length);
      const stored = await getKV(env, `media:${id}`, null);
      if (!stored || !stored.data) {
        return new Response("Not found", { status: 404, headers: CORS_HEADERS });
      }
      const bytes = Uint8Array.from(atob(stored.data), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          "Content-Type": stored.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          ...CORS_HEADERS
        }
      });
    }
    if (!path.startsWith("/api/")) {
      return new Response("sms-blast worker OK", { headers: CORS_HEADERS });
    }
    const internalBookingReply = request.method === "POST"
      && path === "/api/conversations/reply"
      && url.hostname === "sms-blast.internal";
    if (!internalBookingReply && !checkAuth(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }
    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
    }
    if (path === "/api/subscribers" && request.method === "GET") {
      return json({ subscribers: await getSubscribers(env) });
    }
    if (path === "/api/ai-writer/calendar" && request.method === "GET") {
      try {
        return json({ events: await getUpcomingShows() });
      } catch (e) {
        return json({ error: e.message || "Failed to load calendar." }, 502);
      }
    }
    if (path === "/api/ai-writer/draft" && request.method === "POST") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1500) : "";
      const eventId = typeof body.eventId === "string" ? body.eventId : "";
      if (!prompt && !eventId) return json({ error: "Choose a show or describe what you want to announce." }, 400);
      try {
        const events = eventId ? await getUpcomingShows() : [];
        const event = eventId ? events.find((item) => item.id === eventId) : null;
        if (eventId && !event) return json({ error: "That calendar event is no longer available. Refresh the shows and try again." }, 404);
        return json({ draft: await writeBlastWithAI(env, prompt, event), event });
      } catch (e) {
        return json({ error: e.message || "The AI writer could not create a draft." }, 502);
      }
    }
    if (path === "/api/subscribers/add" && request.method === "POST") {
      const phone = normalizePhone(body.phone);
      if (!phone) return json({ error: "Enter a valid US phone number." }, 400);
      const subscribers = await getSubscribers(env);
      const existing = subscribers.find((s) => s.phone === phone);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (existing) {
        if (existing.status === "active") {
          return json({ error: "Already subscribed." }, 400);
        }
        existing.status = "active";
        existing.updatedAt = now;
      } else {
        subscribers.push({ phone, name: "", tags: [], status: "active", joinedAt: now, updatedAt: now });
      }
      await saveSubscribers(env, subscribers);
      return json({ subscribers });
    }
    if (path === "/api/subscribers/remove" && request.method === "POST") {
      const phone = normalizePhone(body.phone) || body.phone;
      const subscribers = await getSubscribers(env);
      const sub = subscribers.find((s) => s.phone === phone);
      if (sub) {
        sub.status = "removed";
        sub.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await saveSubscribers(env, subscribers);
      }
      return json({ subscribers });
    }
    if (path === "/api/subscribers/update" && request.method === "POST") {
      const phone = normalizePhone(body.phone) || body.phone;
      const subscribers = await getSubscribers(env);
      const sub = subscribers.find((s) => s.phone === phone);
      if (!sub) return json({ error: "Subscriber not found." }, 404);
      if (typeof body.name === "string") sub.name = body.name.trim();
      if (Array.isArray(body.tags)) {
        sub.tags = body.tags.map((t) => String(t).trim()).filter(Boolean);
      }
      sub.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await saveSubscribers(env, subscribers);
      return json({ subscribers });
    }
    if (path === "/api/media/upload" && request.method === "POST") {
      if (!body.data) return json({ error: "No image data provided." }, 400);
      const id = crypto.randomUUID();
      await putKV(env, `media:${id}`, { data: body.data, contentType: body.contentType || "image/jpeg" });
      return json({ url: `${url.origin}/media/${id}` });
    }
    if (path === "/api/send" && request.method === "POST") {
      const { message, tags, extraNumbers, mediaUrl, offset, blastId, segmentLabel } = body;
      const subscribers = await getSubscribers(env);
      const active = subscribers.filter((s) => s.status === "active");
      const base = Array.isArray(tags) && tags.length ? active.filter((s) => (s.tags || []).some((t) => tags.includes(t))) : [];
      const basePhones = new Set(base.map((s) => s.phone));
      const extras = (Array.isArray(extraNumbers) ? extraNumbers : []).filter((n) => !basePhones.has(n)).map((n) => ({ phone: n, name: "", tags: [] }));
      const recipients = base.concat(extras);
      const total = recipients.length;
      if (total === 0) return json({ error: "No recipients match the current selection." }, 400);
      const BATCH = 15;
      const start = offset || 0;
      const batch = recipients.slice(start, start + BATCH);
      let sentCount = 0;
      let failedCount = 0;
      for (const r of batch) {
        const personalized = applyMergeTags(message, r.name);
        const result = await sendTwilioSms(env, r.phone, personalized, mediaUrl || void 0);
        if (result.ok) sentCount++;
        else failedCount++;
      }
      const nextOffset = start + batch.length;
      const done = nextOffset >= total;
      const blastlog = await getKV(env, "blastlog", []);
      let entry = blastlog.find((e) => e.id === blastId);
      if (!entry) {
        entry = {
          id: blastId,
          at: (/* @__PURE__ */ new Date()).toISOString(),
          message,
          mediaUrl: mediaUrl || null,
          segmentLabel: segmentLabel || null,
          totalRecipients: total,
          recipientPhones: recipients.map((r) => r.phone),
          sent: 0,
          failed: 0
        };
        blastlog.unshift(entry);
      }
      entry.sent += sentCount;
      entry.failed += failedCount;
      await putKV(env, "blastlog", blastlog);
      return json({ sent: sentCount, failed: failedCount, total, nextOffset, done });
    }
    if (path === "/api/conversations" && request.method === "GET") {
      const conversations = await getKV(env, "conversations", {});
      const subscribers = await getSubscribers(env);
      const list = Object.keys(conversations).map((phone) => {
        const msgs = conversations[phone] || [];
        const last = msgs[msgs.length - 1];
        const sub = subscribers.find((s) => s.phone === phone);
        return {
          phone,
          name: sub && sub.name || "",
          lastMessage: last ? last.body : "",
          lastDirection: last ? last.dir : "",
          at: last ? last.at : null
        };
      });
      list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      return json({ conversations: list });
    }
    if (path === "/api/conversations/thread" && request.method === "GET") {
      const phone = url.searchParams.get("phone");
      const conversations = await getKV(env, "conversations", {});
      return json({ messages: conversations[phone] || [] });
    }
    if (path === "/api/conversations/reply" && request.method === "POST") {
      const { phone, message, mediaUrl } = body;
      if (!phone) return json({ error: "Missing phone." }, 400);
      const result = await sendTwilioSms(env, phone, message, mediaUrl || void 0);
      if (!result.ok) {
        return json({ error: result.data && result.data.message || "Failed to send." }, 502);
      }
      const conversations = await getKV(env, "conversations", {});
      if (!conversations[phone]) conversations[phone] = [];
      conversations[phone].push({
        dir: "out",
        body: message || "",
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ...mediaUrl ? { media: mediaUrl } : {}
      });
      await putKV(env, "conversations", conversations);
      return json({ ok: true });
    }
    if (path === "/api/conversations/delete" && request.method === "POST") {
      const phones = Array.isArray(body.phones) ? body.phones : [];
      const conversations = await getKV(env, "conversations", {});
      phones.forEach((p) => {
        delete conversations[p];
      });
      await putKV(env, "conversations", conversations);
      return json({ ok: true });
    }
    if (path === "/api/templates" && request.method === "GET") {
      return json({ templates: await getKV(env, "templates", []) });
    }
    if (path === "/api/templates/save" && request.method === "POST") {
      const templates = await getKV(env, "templates", []);
      const { id, name, body: tplBody } = body;
      if (!name || !tplBody) return json({ error: "Name and body are required." }, 400);
      if (id) {
        const existing = templates.find((t) => t.id === id);
        if (existing) {
          existing.name = name;
          existing.body = tplBody;
        } else {
          templates.push({ id, name, body: tplBody });
        }
      } else {
        templates.push({ id: crypto.randomUUID(), name, body: tplBody });
      }
      await putKV(env, "templates", templates);
      return json({ templates });
    }
    if (path === "/api/templates/delete" && request.method === "POST") {
      let templates = await getKV(env, "templates", []);
      templates = templates.filter((t) => t.id !== body.id);
      await putKV(env, "templates", templates);
      return json({ templates });
    }
    if (path === "/api/autorules" && request.method === "GET") {
      return json({ rules: await getKV(env, "autorules", []) });
    }
    if (path === "/api/autorules/save" && request.method === "POST") {
      const rules = await getKV(env, "autorules", []);
      const { id, keyword, response } = body;
      if (!keyword || !response) return json({ error: "Keyword and response are required." }, 400);
      if (id) {
        const existing = rules.find((r) => r.id === id);
        if (existing) {
          existing.keyword = keyword;
          existing.response = response;
        } else {
          rules.push({ id, keyword, response });
        }
      } else {
        rules.push({ id: crypto.randomUUID(), keyword, response });
      }
      await putKV(env, "autorules", rules);
      return json({ rules });
    }
    if (path === "/api/autorules/delete" && request.method === "POST") {
      let rules = await getKV(env, "autorules", []);
      rules = rules.filter((r) => r.id !== body.id);
      await putKV(env, "autorules", rules);
      return json({ rules });
    }
    if (path === "/api/blastlog" && request.method === "GET") {
      return json({ log: await getKV(env, "blastlog", []) });
    }
    if (path === "/api/balance" && request.method === "GET") {
      try {
        const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Balance.json`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        const data = await res.json();
        return json(data, res.status);
      } catch (e) {
        return json({ error: "Failed to fetch balance", detail: String(e) }, 502);
      }
    }
    if (path === "/api/scheduled" && request.method === "GET") {
      const scheduledList = await getKV(env, "scheduled_blasts", []);
      return json({ scheduled: scheduledList });
    }
    if (path === "/api/scheduled" && request.method === "POST") {
      const { message, tags, extraNumbers, mediaUrl, segmentLabel, sendAt, recurrence } = body;
      if (!message || typeof message !== "string") {
        return json({ error: "Message is required." }, 400);
      }
      if (!sendAt && !recurrence) {
        return json({ error: "Provide sendAt or a recurrence." }, 400);
      }
      let nextRun;
      if (sendAt) {
        nextRun = new Date(sendAt);
      } else {
        nextRun = computeNextRun(recurrence, /* @__PURE__ */ new Date());
      }
      if (!nextRun || isNaN(nextRun.getTime())) {
        return json({ error: "Invalid date/time." }, 400);
      }
      const scheduledList = await getKV(env, "scheduled_blasts", []);
      const entry = {
        id: "sc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        message,
        tags: Array.isArray(tags) ? tags : [],
        extraNumbers: Array.isArray(extraNumbers) ? extraNumbers : [],
        mediaUrl: mediaUrl || null,
        segmentLabel: segmentLabel || null,
        recurrence: recurrence || null,
        nextRun: nextRun.toISOString(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastRunAt: null,
        status: "pending"
      };
      scheduledList.push(entry);
      await putKV(env, "scheduled_blasts", scheduledList);
      return json({ ok: true, scheduled: entry });
    }
    if (path === "/api/scheduled/update" && request.method === "POST") {
      const { id, message, tags, extraNumbers, mediaUrl, segmentLabel, sendAt, recurrence } = body;
      const scheduledList = await getKV(env, "scheduled_blasts", []);
      const entry = scheduledList.find((e) => e.id === id);
      if (!entry) return json({ error: "Scheduled blast not found." }, 404);
      if (typeof message === "string") entry.message = message;
      if (Array.isArray(tags)) entry.tags = tags;
      if (Array.isArray(extraNumbers)) entry.extraNumbers = extraNumbers;
      if (mediaUrl !== void 0) entry.mediaUrl = mediaUrl || null;
      if (segmentLabel !== void 0) entry.segmentLabel = segmentLabel || null;
      if (recurrence !== void 0) entry.recurrence = recurrence || null;
      if (sendAt) {
        const d = new Date(sendAt);
        if (isNaN(d.getTime())) return json({ error: "Invalid date/time." }, 400);
        entry.nextRun = d.toISOString();
      } else if (recurrence) {
        const d = computeNextRun(recurrence, /* @__PURE__ */ new Date());
        if (d) entry.nextRun = d.toISOString();
      }
      await putKV(env, "scheduled_blasts", scheduledList);
      return json({ ok: true, scheduled: entry });
    }
    if (path === "/api/scheduled/cancel" && request.method === "POST") {
      const { id } = body;
      const scheduledList = await getKV(env, "scheduled_blasts", []);
      const entry = scheduledList.find((e) => e.id === id);
      if (!entry) return json({ error: "Scheduled blast not found." }, 404);
      entry.status = "canceled";
      await putKV(env, "scheduled_blasts", scheduledList);
      return json({ ok: true });
    }
    if (path === "/api/scheduled/delete" && request.method === "POST") {
      const { id } = body;
      const scheduledList = await getKV(env, "scheduled_blasts", []);
      const idx = scheduledList.findIndex((e) => e.id === id);
      if (idx === -1) return json({ error: "Scheduled blast not found." }, 404);
      scheduledList.splice(idx, 1);
      await putKV(env, "scheduled_blasts", scheduledList);
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDueScheduledBlasts(env));
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
