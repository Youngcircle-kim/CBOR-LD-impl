import { CBORLDState, TermDefinition } from '../interfaces';

export function parse(compactDoc: Record<string, unknown>, state: CBORLDState) {
  const result: Record<string, unknown> = {};

  const termMaps = Array.from(state.contextMap.values()).map(
    (entry) => entry.termMap,
  );

  for (const key in compactDoc) {
    if (key === '@context') continue;

    const termDef = termMaps.find((map) => key in map)?.[key];
    if (!termDef) {
      result[key] = compactDoc[key];
      continue;
    }

    const expandedKey = termDef['@id'];
    if (!expandedKey) {
      throw new Error(`Term definition for "${key}" is missing an '@id'`);
    }

    if (termDef['@type'] === '@id' && typeof compactDoc[key] === 'string') {
      result[expandedKey] = { '@id': compactDoc[key] };
    } else {
      result[expandedKey] = compactDoc[key];
    }
  }

  return result;
}
