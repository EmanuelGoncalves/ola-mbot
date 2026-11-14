const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Creates an HTML element.
 * Props: `class`, `text`, `on<Event>` listeners; anything else becomes an attribute.
 */
export function el(tag, props = {}, ...children) {
  return build(document.createElement(tag), props, children);
}

/** Same as `el`, for SVG elements. */
export function svg(tag, props = {}, ...children) {
  return build(document.createElementNS(SVG_NAMESPACE, tag), props, children);
}

function build(node, props, children) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}
