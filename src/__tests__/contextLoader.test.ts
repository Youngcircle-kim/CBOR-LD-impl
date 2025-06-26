import { describe, it, expect, beforeEach } from 'vitest';
import { init, loadContext } from '../loader/contextLoader';
import type { CBORLDState } from '../interfaces';

describe('Context Loader', () => {
  let state: CBORLDState;

  beforeEach(() => {
    state = {
      strategy: 'compression',
      contextMap: new Map(),
      nextTermId: 0,
      keywordsMap: new Map(),
      termToId: new Map(),
      idToTerm: new Map(),
      registryEntryId: 0,
    };
  });

  it('init should initialize state correctly', () => {
    const result = init(state);
    expect(result.nextTermId).toBe(100);
    expect(result.contextMap.size).toBe(0);
    expect(result.keywordsMap.get('@context')).toBe(0);
    expect(result.termToId.get('@type')).toBe(2);
  });

  it('init with decompression should create idToTerm mapping', () => {
    state.strategy = 'decompression';
    const result = init(state);
    expect(result.idToTerm?.get(4)).toBe('@id');
  });

  it('loadContext should load and parse embedded context', async () => {
    init(state);
    const testContext = {
      name: 'https://schema.org/name',
      homepage: { '@id': 'https://schema.org/url', '@type': '@id' },
    };

    const { state: newState, entry } = await loadContext(state, testContext);
    expect(Object.keys(entry.termMap)).toContain('name');
    expect(Object.keys(entry.termMap)).toContain('homepage');
    expect(newState.termToId.has('name')).toBe(true);
    expect(newState.termToId.has('homepage')).toBe(true);
  });

  it('loadContext should fetch and cache remote context', async () => {
    init(state);

    // @ts-expect-error: mocking global.fetch for test only
    global.fetch = async (url: string) =>
      ({
        json: async () => ({
          '@context': {
            nickname: 'https://schema.org/alternateName',
          },
        }),
      }) as any;

    const { state: updatedState, entry } = await loadContext(
      state,
      'https://example.com/context',
    );
    expect(entry.termMap['nickname']['@id']).toBe(
      'https://schema.org/alternateName',
    );
    expect(updatedState.termToId.has('nickname')).toBe(true);
  });
});
