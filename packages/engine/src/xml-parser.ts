/**
 * Minimal XML parser covering what MarkovJunior files use: elements,
 * attributes, comments, processing instructions and character entities.
 * Text content is ignored. Written in-house because DOMParser does not exist
 * inside Web Workers, where the engine runs.
 */

export interface XmlElement {
  name: string;
  /** Attributes in source order. */
  attributes: Map<string, string>;
  children: XmlElement[];
  /** 1-based line of the opening tag. */
  line: number;
}

export class XmlSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`${message} (line ${line})`);
    this.name = 'XmlSyntaxError';
  }
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g;
const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export function parseXml(source: string): XmlElement {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let pos = 0;

  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (p: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= p) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const fail = (message: string, at = pos): never => {
    throw new XmlSyntaxError(message, lineAt(at));
  };

  const skipWs = (): void => {
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
  };
  const readName = (): string => {
    NAME.lastIndex = pos;
    const m = NAME.exec(text);
    if (!m) return fail('expected a name');
    pos += m[0].length;
    return m[0];
  };
  const skipPast = (terminator: string, what: string): void => {
    const end = text.indexOf(terminator, pos);
    if (end < 0) fail(`unterminated ${what}`);
    pos = end + terminator.length;
  };
  const decode = (raw: string, at: number): string =>
    raw.replace(ENTITY, (whole, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return String.fromCodePoint(code);
      }
      const named = NAMED_ENTITIES[body];
      return named ?? fail(`unknown entity ${whole}`, at);
    });

  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];

  while (pos < text.length) {
    const lt = text.indexOf('<', pos);
    if (lt < 0) {
      if (text.slice(pos).trim() && stack.length === 0) fail('text outside the root element');
      pos = text.length;
      break;
    }
    if (stack.length === 0 && text.slice(pos, lt).trim()) fail('text outside the root element');
    pos = lt;

    if (text.startsWith('<!--', pos)) {
      skipPast('-->', 'comment');
    } else if (text.startsWith('<?', pos)) {
      skipPast('?>', 'processing instruction');
    } else if (text.startsWith('<![CDATA[', pos)) {
      skipPast(']]>', 'CDATA section');
    } else if (text.startsWith('<!', pos)) {
      skipPast('>', 'declaration');
    } else if (text.startsWith('</', pos)) {
      const start = pos;
      pos += 2;
      const name = readName();
      skipWs();
      if (text[pos] !== '>') fail('expected >');
      pos++;
      const open = stack.pop();
      if (!open) fail(`unexpected closing tag </${name}>`, start);
      if (open!.name !== name) fail(`expected </${open!.name}> but found </${name}>`, start);
    } else {
      const start = pos;
      pos++;
      const element: XmlElement = {
        name: readName(),
        attributes: new Map(),
        children: [],
        line: lineAt(start),
      };
      const parent = stack.at(-1);
      if (parent) parent.children.push(element);
      else if (root) fail('only one root element is allowed', start);
      else root = element;
      for (;;) {
        skipWs();
        if (text.startsWith('/>', pos)) {
          pos += 2;
          break;
        }
        if (text[pos] === '>') {
          pos++;
          stack.push(element);
          break;
        }
        if (pos >= text.length) fail(`unterminated tag <${element.name}>`, start);
        const attrAt = pos;
        const attr = readName();
        skipWs();
        if (text[pos] !== '=') fail(`expected = after attribute ${attr}`);
        pos++;
        skipWs();
        const quote = text[pos];
        if (quote !== '"' && quote !== "'") fail(`expected a quoted value for ${attr}`);
        const end = text.indexOf(quote!, pos + 1);
        if (end < 0) fail(`unterminated value for ${attr}`);
        if (element.attributes.has(attr)) fail(`duplicate attribute ${attr}`, attrAt);
        element.attributes.set(attr, decode(text.slice(pos + 1, end), attrAt));
        pos = end + 1;
      }
    }
  }

  if (stack.length > 0) fail(`unclosed tag <${stack.at(-1)!.name}>`, text.length);
  if (!root) fail('no root element', 0);
  return root!;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ESCAPES[ch]!);
}
