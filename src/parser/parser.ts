import { CBORLDState } from '../interfaces';

export function parse(
  compactDoc: Record<string, unknown>,
  state: CBORLDState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let termMaps = Array.from(state.contextMap.values()).map((e) => e.termMap);

  const types = compactDoc['@type'];
  if (typeof types === 'string') {
    const nestedTermMap = state.contextMap.get(`${types}::nested`)?.termMap;
    if (nestedTermMap) termMaps.unshift(nestedTermMap);
  } else if (Array.isArray(types)) {
    for (const t of types) {
      const nestedTermMap = state.contextMap.get(`${t}::nested`)?.termMap;
      if (nestedTermMap) termMaps.unshift(nestedTermMap);
    }
  }

  for (const key in compactDoc) {
    if (key === '@context') continue;
    const value = compactDoc[key];
    const termDef = termMaps.find((map) => key in map)?.[key];
    const expandedKey = termDef?.['@id'] ?? key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[expandedKey] = parse(value as Record<string, unknown>, state);
    } else if (Array.isArray(value)) {
      result[expandedKey] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? parse(item as Record<string, unknown>, state)
          : item,
      );
    } else if (termDef?.['@type'] === '@id' && typeof value === 'string') {
      result[expandedKey] = { '@id': value };
    } else {
      result[expandedKey] = value;
    }
  }

  return result;
}
