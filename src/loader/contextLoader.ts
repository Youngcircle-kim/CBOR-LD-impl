import { CBORLDState, ContextEntry, TermDefinition } from '../interfaces';

/**
 * Initialize Context Loader
 * @param state
 */
export function init(state: CBORLDState): CBORLDState {
  /**
   * Alg. process
   * 1. state.contextMap ← 빈 맵 초기화 (context URL → termMap 구조 저장)
   * 2. state.nextTermId ← 100으로 초기화 (사용자 정의 term 시작 ID)
   * 3. state.keywordsMap ← JSON-LD keyword를 고정된 짝수 정수로 매핑
   * 4. state.termToId에 keywordsMap을 등록
   * 5. 압축 전략이 "decompression"이면 state.idToTerm ← 역매핑 추가
   */
  if (state.strategy !== 'compression' && state.strategy !== 'decompression') {
    throw new Error(`Invalid strategy: ${state.strategy}`);
  }

  state.contextMap = new Map<string, ContextEntry>();
  state.nextTermId = 100;

  state.keywordsMap = new Map<string, number>([
    ['@context', 0],
    ['@type', 2],
    ['@id', 4],
    ['@value', 6],
    ['@direction', 8],
    ['@graph', 10],
    ['@included', 12],
    ['@index', 14],
    ['@json', 16],
    ['@language', 18],
    ['@list', 20],
    ['@nest', 22],
    ['@reverse', 24],
    ['@base', 26],
    ['@container', 28],
    ['@default', 30],
    ['@embed', 32],
    ['@explicit', 34],
    ['@none', 36],
    ['@omitDefault', 38],
    ['@prefix', 40],
    ['@preserve', 42],
    ['@protected', 44],
    ['@requireAll', 46],
    ['@set', 48],
    ['@version', 50],
    ['@vocab', 52],
    ['@propagate', 54],
  ]);

  state.termToId = new Map<string, number>(state.keywordsMap);

  if (!state.idToTerm) state.idToTerm = new Map();

  if (state.strategy === 'decompression') {
    state.idToTerm = new Map<number, string>();
    for (const [term, id] of state.termToId.entries()) {
      state.idToTerm.set(id, term);
    }
  }
  return state;
}

/**
 * Load Context
 * @param state
 * @param contextIdentifier
 */
export async function loadContext(
  state: CBORLDState,
  contextIdentifier: string | Object,
): Promise<{ state: CBORLDState; entry: ContextEntry }> {
  /**
   * 1. contextIdentifier가 state.contextMap에 이미 있으면 → 해당 entry 반환
   * 2. contextIdentifier가 문자열이면 → 외부에서 JSON-LD context 불러옴 → @context만 추출
   * 3. 내부 context 객체이면 → 그대로 사용
   * 4. 추출된 context와 함께 Add Context Algorithm 호출
   */
  if (typeof contextIdentifier === 'string') {
    if (state.contextMap.has(contextIdentifier)) {
      return {
        state,
        entry: state.contextMap.get(contextIdentifier)!,
      };
    }

    const fetched = await fetch(contextIdentifier);
    const json = await fetched.json();
    const context = json['@context'];
    return addContext(state, context, contextIdentifier);
  }

  // contextIdentifier가 객체일 경우 (내부 context)
  return addContext(state, contextIdentifier, '');
}

/**
 * Add Context
 * @param state
 * @param context
 * @param contextUrl
 */
export function addContext(
  state: CBORLDState,
  context: any,
  contextUrl: string,
) {
  /**
   * 1. context에 @import가 있으면 → import된 context도 재귀적으로 처리
   * 2. term 정의들을 정렬(lexicographic)한 뒤 순회
   *    2.1. keyword(@id, @type 등)는 건너뜀
   *    2.2. 각 term 정의를 termMap에 저장
   *    2.3. 새 term은 state.termToId에 integer 할당 (100부터 2씩 증가)
   *    2.4. state.idToTerm에 역매핑 추가
   * 3. 최종적으로 state.contextMap[contextUrl] 또는 context로 context 저장
   */
  const termMap: Record<string, TermDefinition> = {};
  const entry: ContextEntry = { context, termMap };

  const sortedTerms = Object.keys(context).sort();

  const isProtected = context['@protected'] === true;

  for (const term of sortedTerms) {
    if (state.keywordsMap.has(term)) continue;

    let definition = context[term];
    if (definition == null) continue;

    if (typeof definition === 'string') {
      definition = { '@id': definition };
    }

    definition.protected = isProtected;
    termMap[term] = definition;

    if (definition['@context']) {
      const nestedCtx = definition['@context'];
      const nestedContextKey = `${term}::nested`;
      const nestedEntry = addContext(state, nestedCtx, nestedContextKey);

      state.contextMap.set(nestedContextKey, nestedEntry.entry);
    }

    if (!state.termToId.has(term) && state.idToTerm != undefined) {
      const termId = state.nextTermId;
      state.nextTermId += 2;
      state.termToId.set(term, termId);
      if (state.strategy === 'decompression') {
        state.idToTerm.set(termId, term);
      }
    }
  }

  if (contextUrl) {
    state.contextMap.set(contextUrl, entry);
  } else {
    state.contextMap.set(JSON.stringify(context), entry);
  }

  return { state, entry };
}
