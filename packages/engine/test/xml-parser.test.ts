import { describe, expect, it } from 'vitest';
import { escapeAttribute, parseXml, XmlSyntaxError } from '../src/xml-parser';

describe('parseXml', () => {
  it('parses nested elements, attributes and line numbers', () => {
    const el = parseXml(`<?xml version="1.0"?>
<!-- a comment -->
<markov values="BW" origin='True'>
  <one in="B" out="W"/>
  <all>
    <rule in="BW" out="WW"/>
  </all>
</markov>
<!-- trailing comment -->`);
    expect(el.name).toBe('markov');
    expect(el.line).toBe(3);
    expect([...el.attributes]).toEqual([
      ['values', 'BW'],
      ['origin', 'True'],
    ]);
    expect(el.children.map((c) => c.name)).toEqual(['one', 'all']);
    expect(el.children[1]!.children[0]!.attributes.get('in')).toBe('BW');
    expect(el.children[1]!.children[0]!.line).toBe(6);
  });

  it('strips a byte-order mark and decodes entities', () => {
    const el = parseXml('﻿<a x="&lt;&amp;&#65;&#x42;&quot;"/>');
    expect(el.attributes.get('x')).toBe('<&AB"');
  });

  it.each([
    ['<a>', 'unclosed tag <a>'],
    ['<a></b>', 'expected </a> but found </b>'],
    ['<a/><b/>', 'only one root element'],
    ['<a x=1/>', 'expected a quoted value'],
    ['<a x="1" x="2"/>', 'duplicate attribute x'],
    ['', 'no root element'],
    ['<a x="&bogus;"/>', 'unknown entity'],
    ['hello <a/>', 'text outside the root'],
  ])('rejects %j', (source, message) => {
    expect(() => parseXml(source)).toThrow(XmlSyntaxError);
    expect(() => parseXml(source)).toThrow(message);
  });

  it('reports the line of the error', () => {
    try {
      parseXml('<a>\n  <b>\n</a>');
      expect.unreachable();
    } catch (e) {
      expect((e as XmlSyntaxError).line).toBe(3);
    }
  });

  it('escapes attribute values', () => {
    expect(escapeAttribute('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
});
