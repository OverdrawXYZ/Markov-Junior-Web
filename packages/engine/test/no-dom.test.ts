import { describe, expect, it } from 'vitest';
import * as engine from '../src';

// The engine must run without any DOM globals (Node / Web Worker).
describe('engine environment', () => {
  it('loads without DOM globals', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(engine.ENGINE_VERSION).toBeTypeOf('string');
  });
});
