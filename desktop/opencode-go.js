"use strict";

// What OpenCode Go serves and how each model takes a thinking level, from the public catalog at models.dev (providers/opencode-go).
// levels are the values of reasoning_effort the model takes; toggle means thinking.type switches thinking on and off.
// Neither means the model thinks on its own and takes no level. other marks models served on the Responses or Messages
// endpoints, which this Chat Completions transport can't reach.
const MODELS = {
 'deepseek-v4-flash-vision-exp': {"name": "DeepSeek V4 Flash Vision Exp", "context": 1000000, "vision": true, "levels": ["low", "high", "max"], "toggle": true},
 'deepseek-v4-flash': {"name": "DeepSeek V4 Flash", "context": 1000000, "vision": false, "levels": ["low", "high", "max"]},
 'deepseek-v4-pro': {"name": "DeepSeek V4 Pro (New)", "context": 1000000, "vision": false, "levels": ["high", "max"]},
 'deepseek-v4.1-flash': {"name": "DeepSeek V4.1 Flash", "context": 1000000, "vision": true, "levels": ["low", "high", "max"]},
 'glm-5.2': {"name": "GLM-5.2", "context": 1000000, "vision": false, "levels": ["high", "max"]},
 'glm-5.3-flash': {"name": "GLM-5.3-Flash", "context": 1000000, "vision": true, "levels": ["low", "high", "max"]},
 'glm-5.3': {"name": "GLM-5.3", "context": 1000000, "vision": false, "levels": ["low", "high", "max"]},
 'gpt-5.6-luna': {"name": "GPT-5.6 Luna", "other": true},
 'gpt-6-luna': {"name": "GPT-6 Luna", "other": true},
 'grok-4.5': {"name": "Grok 4.5", "other": true},
 'grok-4.6': {"name": "Grok 4.6", "other": true},
 'grok-4.7': {"name": "Grok 4.7", "other": true},
 'hy3': {"name": "Hy3", "context": 256000, "vision": false, "levels": ["none", "low", "high"]},
 'hy4-preview': {"name": "Hy4 preview", "context": 1024000, "vision": false, "levels": ["none", "high"]},
 'kimi-k2.6': {"name": "Kimi K2.6", "context": 262144, "vision": true},
 'kimi-k2.7-code': {"name": "Kimi K2.7 Code", "context": 262144, "vision": true},
 'kimi-k3': {"name": "Kimi K3", "context": 1048576, "vision": true, "levels": ["max"]},
 'longcat-2.0': {"name": "LongCat-2.0", "context": 1000000, "vision": false, "toggle": true},
 'longcat-2.5-preview-free': {"name": "LongCat 2.5 Preview Free", "context": 1000000, "vision": true, "toggle": true},
 'mimo-v2.5-pro': {"name": "MiMo V2.5 Pro", "context": 1048576, "vision": false},
 'mimo-v2.5': {"name": "MiMo V2.5", "context": 1000000, "vision": true},
 'mimo-v2.6-flash': {"name": "MiMo-V2.6-Flash", "context": 1048576, "vision": true},
 'mimo-v2.6-pro': {"name": "MiMo-V2.6-Pro", "context": 1048576, "vision": true},
 'minimax-m2.7': {"name": "MiniMax-M2.7", "other": true},
 'minimax-m3': {"name": "MiniMax-M3", "other": true},
 'muse-spark-1.2-contributor': {"name": "Muse Spark 1.2 Contributor", "other": true},
 'muse-spark-1.3-contributor': {"name": "Muse Spark 1.3 Contributor", "other": true},
 'qwen3.6-plus': {"name": "Qwen3.6 Plus", "context": 1000000, "vision": true, "toggle": true},
 'qwen3.7-max': {"name": "Qwen3.7 Max", "context": 1000000, "vision": false, "toggle": true},
 'qwen3.7-plus': {"name": "Qwen3.7 Plus", "other": true},
 'qwen3.8-flash': {"name": "Qwen3.8 Flash", "other": true},
 'qwen3.8-max': {"name": "Qwen3.8 Max", "other": true},
 'space-bunny-free': {"name": "Space Bunny Free", "context": 1048576, "vision": true, "levels": ["low", "medium", "high", "xhigh", "max"]},
};

const isHost = baseUrl => { try { return /(^|\.)opencode\.ai$/.test(new URL(baseUrl).hostname); } catch { return false; } };

// The app's none is "thinking off": it is offered only where the model can really switch thinking off.
function efforts(entry) {
 const levels = entry.levels || [];
 const list = levels.includes('none') || entry.toggle ? ['none'] : [];
 list.push(...levels.filter(level => level !== 'none'));
 if (entry.toggle && list.length === 1) list.push('high');
 return list.length ? list : ['medium'];
}
function fallback(entry) {
 const list = efforts(entry);
 return list.includes('high') ? 'high' : list[list.length - 1];
}
// A level and the switch are never sent together: some models refuse the pair.
function thinking(entry, effort) {
 const levels = entry.levels || [];
 if (effort === 'none') return levels.includes('none') ? { reasoning_effort: 'none' } : entry.toggle ? { thinking: { type: 'disabled' } } : {};
 if (levels.includes(effort)) return { reasoning_effort: effort };
 return entry.toggle ? { thinking: { type: 'enabled' } } : {};
}

module.exports = { MODELS, isHost, efforts, fallback, thinking };
