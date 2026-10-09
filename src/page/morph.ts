// Redraws an element from HTML by changing only what differs, so the elements
// that stay keep focus, a half-typed value and a click in progress.

/** Makes `el`'s contents match `html`. */
export function morph(el: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(el, template.content);
}

function patchChildren(from: Node, to: Node) {
  const old = [...from.childNodes];
  // Counted first: appending a new node moves it out of `to`.
  const next = [...to.childNodes];
  next.forEach((node, i) => {
    const current = old[i];
    if (!current) from.appendChild(node);
    else if (current.nodeName !== node.nodeName) from.replaceChild(node, current);
    else if (current instanceof Element && node instanceof Element) patchElement(current, node);
    else if (current.nodeValue !== node.nodeValue) current.nodeValue = node.nodeValue;
  });
  for (const extra of old.slice(next.length)) extra.remove();
}

function patchElement(current: Element, next: Element) {
  for (const { name } of [...current.attributes]) if (!next.hasAttribute(name)) current.removeAttribute(name);
  for (const { name, value } of [...next.attributes]) if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  patchChildren(current, next);
  // What's on screen in a form control is its property, not its attribute. Leave
  // the one being typed in alone.
  if (current === document.activeElement && current instanceof HTMLInputElement && current.type !== 'checkbox') return;
  if (current instanceof HTMLInputElement) {
    if (current.type === 'checkbox') current.checked = next.hasAttribute('checked');
    else if (current.value !== (next.getAttribute('value') ?? '')) current.value = next.getAttribute('value') ?? '';
  } else if (current instanceof HTMLSelectElement) {
    current.selectedIndex = Math.max(0, [...next.querySelectorAll('option')].findIndex(o => o.hasAttribute('selected')));
  }
}
