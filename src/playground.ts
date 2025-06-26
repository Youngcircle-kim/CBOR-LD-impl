import { init, loadContext } from './loader/contextLoader';
import type { CBORLDState } from './interfaces';

async function main() {
  // 1. 초기 상태 정의
  const state: CBORLDState = {
    strategy: 'compression',
    contextMap: new Map(),
    nextTermId: 0,
    keywordsMap: new Map(),
    termToId: new Map(),
    registryEntryId: 0,
  };

  // 2. 초기화
  init(state);

  // 3. JSON-LD 파일 불러오기
  const jsonld = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://schema.org/docs/jsonldcontext.jsonld',
    ],
    id: 'http://example.com/credentials/1234',
    type: ['VerifiableCredential', 'Ticket'],
    issuer: 'did:sov:VV9pK5ZrLPRwYmotgACPkC',
    issuanceDate: '2025-05-10T14:45:00Z',
    credentialSubject: {
      id: 'did:sov:SubjectDID987654321',
      ticketNumber: 'TICKET123789',
      ticketToken: 'https://example.com/ticket/token/def456',
      issuedBy: {
        name: 'Music Festival Organizer',
        id: 'did:sov:VV9pK5ZrLPRwYmotgACPkC',
      },
      underName: [
        {
          name: 'Charlie',
          id: 'did:sov:charlieDID123456789',
        },
      ],
    },
    proof: {
      type: 'Ed25519Signature2018',
      created: '2025-05-10T14:45:00Z',
      proofPurpose: 'assertionMethod',
      verificationMethod: 'did:sov:VV9pK5ZrLPRwYmotgACPkC#keys-1',
      jws: 'eyJhbGciOiJFZERTQSJ9.AdwMgeerwtHoh-l192l60hp9wAHZFVJbLfD_UxMi70cwnCAPZgoXD2YBJZCPEX3xKpRwcdOO8KpEHwJjyqOgzDO7iKvU8vcnwNrmxYbSW9ERBXukOXolLzeO_Jn',
    },
  };

  // 4. @context 처리
  const contexts = Array.isArray(jsonld['@context'])
    ? jsonld['@context']
    : [jsonld['@context']];

  for (const ctx of contexts) {
    await loadContext(state, ctx);
  }

  // 5. 결과 출력
  console.log('Term to ID Map:', Object.fromEntries(state.termToId));
  console.log('Context Map Keys:', [...state.contextMap.keys()]);
}

main().catch(console.error);
