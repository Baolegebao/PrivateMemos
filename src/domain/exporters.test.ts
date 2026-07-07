import { describe, expect, it } from 'vitest';
import { buildDocx } from './exporters';

describe('exporters', () => {
  it('builds a docx zip with document xml', () => {
    const bytes = buildDocx('Title', 'hello\nworld');
    const text = new TextDecoder().decode(bytes);

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('word/document.xml');
    expect(text).toContain('hello');
    expect(text).toContain('world');
  });

  it('escapes xml content', () => {
    const text = new TextDecoder().decode(buildDocx('A&B', '<tag>'));

    expect(text).toContain('A&amp;B');
    expect(text).toContain('&lt;tag&gt;');
  });
});
