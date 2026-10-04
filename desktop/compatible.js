"use strict";

const Go = require('./opencode-go');

// Generic Chat Completions transport for LiteLLM and local model servers.
function base(value) {
 const url = new URL(value);
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) base URL without credentials, query or fragment');
 return url.href.replace(/\/$/, '');
}
// OpenCode Go routes and caches by conversation: it rejects requests without a stable session id and asks clients to name themselves.
const fallbackSession = require('crypto').randomUUID();
function identity(config, version) {
 const headers = { 'User-Agent': `OpenGhost/${version || '1.0'}` };
 if (/(^|\.)opencode\.ai$/.test(new URL(config.baseUrl).hostname)) headers['x-opencode-session'] = String(config.session || fallbackSession);
 return headers;
}
async function request(config, path, options = {}) {
 const headers = { 'Content-Type': 'application/json', ...identity(config, options.version) };
 if (config.key) headers.Authorization = `Bearer ${config.key}`;
 const { version, ...init } = options;
 const response = await fetch(`${base(config.baseUrl)}/${path}`, { ...init, headers });
 if (!response.ok) {
  let detail;
  try { detail = (await response.json()).error?.message; } catch {}
  throw Object.assign(new Error(detail || `Model server returned ${response.status}`), { status: response.status });
 }
 return response;
}
// Thinking is asked for the way most Chat Completions servers take it: a level in reasoning_effort, and thinking switched off for none.
// The two are never sent together: some models refuse the pair.
const EFFORTS = ['none', 'low', 'medium', 'high'];
function thinking(effort) {
 if (effort === 'none') return { thinking: { type: 'disabled' } };
 return EFFORTS.includes(effort) ? { reasoning_effort: effort } : {};
}
async function models(config, { version } = {}) {
 const data = (await (await request(config, 'models', { version })).json()).data || [];
 const go = Go.isHost(config.baseUrl);
 return data.filter(item => typeof item.id === 'string' && item.id && !(go && Go.MODELS[item.id]?.other)).map(item => go && Go.MODELS[item.id] ? {
  id: `compatible:${item.id}`, api: item.id, name: Go.MODELS[item.id].name, provider: 'compatible',
  context: Go.MODELS[item.id].context || 32768, vision: !!Go.MODELS[item.id].vision,
  efforts: Go.efforts(Go.MODELS[item.id]), defaultEffort: Go.fallback(Go.MODELS[item.id]),
 } : ({
  id: `compatible:${item.id}`, api: item.id, name: item.name || item.id, provider: 'compatible',
  context: Number(item.context_window) || 32768, vision: item.input_modalities?.includes('image') || false,
  efforts: EFFORTS.slice(), defaultEffort: 'none',
 }));
}
async function stream(config, { signal, onEvent = () => {}, version }) {
 const messages = config.messages.map(({ native, cache, ...message }) => ({ ...message,
  content: !config.vision && Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : message.content,
 }));
 const send = extra => request(config, 'chat/completions', { method: 'POST', signal, version, body: JSON.stringify({
  model: config.model, messages, stream: true, stream_options: { include_usage: true },
  ...(config.tools?.length ? { tools: config.tools } : {}),
  ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
  ...extra,
 }) });
 const known = Go.isHost(config.baseUrl) && Go.MODELS[config.model];
 const level = known ? Go.thinking(known, config.effort) : thinking(config.effort);
 let response;
 try {
  response = await send(level);
 } catch (error) {
  // A server that doesn't know the thinking fields answers 400: the request goes again without them rather than failing the chat.
  if (error.status !== 400 || !Object.keys(level).length) throw error;
  response = await send({});
 }
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 const calls = [];
 const reader = response.body.getReader(), decoder = new TextDecoder();
 let buffer = '';
 function line(value) {
  if (!value.startsWith('data:')) return;
  const data = value.slice(5).trim();
  if (!data || data === '[DONE]') return;
  const chunk = JSON.parse(data);
  if (chunk.error) throw new Error(chunk.error.message || 'Model server error');
  if (chunk.usage) result.usage = chunk.usage;
  const choice = chunk.choices?.[0];
  if (!choice) return;
  const delta = choice.delta || {};
  for (const [field, type] of [['content', 'content'], ['reasoning_content', 'reasoning']]) {
   if (delta[field]) { result[type] += delta[field]; onEvent({ type, delta: delta[field] }); }
  }
  for (const part of delta.tool_calls || []) {
   const call = calls[part.index ?? 0] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
   if (part.id) call.id = part.id;
   if (part.function?.name) call.function.name += part.function.name;
   if (part.function?.arguments) call.function.arguments += part.function.arguments;
  }
  if (choice.finish_reason) result.finishReason = choice.finish_reason;
 }
 try {
  for (;;) {
   const { value, done } = await reader.read();
   buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
   const lines = buffer.split('\n'); buffer = lines.pop();
   for (const value of lines) line(value);
   if (done) { line(buffer); break; }
  }
 } finally { await reader.cancel().catch(() => {}); }
 result.toolCalls = calls.filter(call => call?.function.name);
 return result;
}
module.exports = { models, stream, base };
