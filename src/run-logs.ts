// run-logs.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { cborEncode, cborDecode } from './mini-cbor.js';
import { emitQRCodesRobust } from './qr-robust.js';

function pct(n: number, d: number) {
  return ((100 * n) / d).toFixed(1) + '%';
}
function human(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

(async function main() {
  // 1) 원본 JSON 로드
  const jsonStr = readFileSync('sample-vp.jsonld', 'utf8');
  const jsonObj = JSON.parse(jsonStr);

  // 2) CBOR 인코딩
  const cbor = cborEncode(jsonObj);

  // 3) GZIP(CBOR)
  const gzCbor = gzipSync(cbor);

  // 4) 라운드트립 검증
  const roundTrip = cborDecode(cbor);
  const same = JSON.stringify(roundTrip) === JSON.stringify(jsonObj);

  // 5) 사이즈/압축률 계산
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const jsonSize = jsonBytes.length;
  const cborSize = cbor.length;
  const gzCborSize = gzCbor.length;

  // 6) 결과 출력
  console.log('🧪 Round-trip identical:', same ? '✅' : '❌');
  console.log('— Sizes —');
  console.log(`JSON           : ${human(jsonSize)} (${jsonSize} bytes)`);
  console.log(
    `CBOR           : ${human(cborSize)} (${cborSize} bytes) — ${pct(cborSize, jsonSize)} of JSON`,
  );
  console.log(
    `GZIP(CBOR)     : ${human(gzCborSize)} (${gzCborSize} bytes) — ${pct(gzCborSize, jsonSize)} of JSON, ${pct(gzCborSize, cborSize)} of CBOR`,
  );
  await emitQRCodesRobust(
    new Uint8Array(gzCbor.buffer, gzCbor.byteOffset, gzCbor.byteLength),
    'dist/out/qr',
    'vp_cbor_gz',
  );
})();
