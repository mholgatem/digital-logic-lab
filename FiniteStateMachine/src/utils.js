export function formatScriptedText(text) {
  if (!text) return '';
  return text.replace(/_([a-zA-Z0-9{}]+)/g, '<sub>$1</sub>')
             .replace(/\^([a-zA-Z0-9{}]+)/g, '<sup>$1</sup>');
}

export function parseList(text) {
  if (!text) return [];
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export function selectionLabel(names, values) {
  if (!names.length) return '';
  return names.map((name, i) => {
    const val = values[i] || '0';
    return `${name}=${val}`;
  }).join(', ');
}

export function cloneColumnToken(token) {
  if (!token) return null;
  return { ...token };
}

export function uniqueId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function sanitizeFilename(name, fallback = 'fsm') {
  const base = (name || fallback).toString().trim();
  const cleaned = base.replace(/[^a-z0-9_-]+/gi, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}
