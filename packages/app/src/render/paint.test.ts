import { describe, expect, it } from 'vitest';
import { buildLut, hex, paint } from './paint';

describe('paint', () => {
  it('maps symbols to RGBA pixels via the palette', () => {
    const lut = buildLut('BR'); // B = 000000, R = FF004D
    const pixels = new Uint32Array(3);
    paint(Uint8Array.from([0, 1, 0]), lut, pixels);
    const bytes = new Uint8Array(pixels.buffer);
    expect([...bytes]).toEqual([0, 0, 0, 255, 0xff, 0x00, 0x4d, 255, 0, 0, 0, 255]);
  });

  it('formats hex colours', () => {
    expect(hex(0x00e436)).toBe('#00e436');
  });
});
