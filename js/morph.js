// Rewinder — refreshes the page in place instead of rebuilding it.
// Elements that stay on screen are kept and patched, so focus, a half-typed value and a click in progress all survive.

const keyOf = (node) => (node.nodeType === 1 ? node.getAttribute('data-key') || node.id || null : null);
const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

export function morphChildren(from, to) {
  let cur = from.firstChild;
  let next = to.firstChild;
  while (next) {
    const after = next.nextSibling;
    const key = keyOf(next);
    let match = null;
    if (key) {
      for (let c = cur; c; c = c.nextSibling) {
        if (keyOf(c) === key && sameKind(c, next)) { match = c; break; }
      }
    } else if (cur && !keyOf(cur) && sameKind(cur, next)) {
      match = cur;
    }
    if (match) {
      if (match === cur) cur = cur.nextSibling;
      else from.insertBefore(match, cur);
      morphNode(match, next);
    } else {
      from.insertBefore(next, cur);
    }
    next = after;
  }
  while (cur) {
    const after = cur.nextSibling;
    from.removeChild(cur);
    cur = after;
  }
}

function morphNode(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);

  const focused = a === document.activeElement;
  const tag = a.tagName;
  if (tag === 'INPUT') {
    if (a.type === 'checkbox' || a.type === 'radio') {
      a.checked = b.hasAttribute('checked');
    } else if (a.type !== 'file' && !focused && !a.hasAttribute('data-keep')) {
      const value = b.getAttribute('value') ?? '';
      if (a.value !== value) a.value = value;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    if (!focused) {
      const value = b.textContent;
      if (a.value !== value) a.value = value;
    }
    return;
  }
  morphChildren(a, b);
  if (tag === 'SELECT') {
    const chosen = b.querySelector('option[selected]');
    const value = chosen ? chosen.getAttribute('value') ?? chosen.textContent : a.options.length ? a.options[0].value : '';
    if (a.value !== value) a.value = value;
  }
}
