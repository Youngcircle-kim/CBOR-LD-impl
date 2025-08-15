import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash, BinaryLike } from 'node:crypto';
import QRCode, { QRCodeSegment } from 'qrcode';
import { cborEncode, cborDecode } from './mini-cbor.js';

// ====== 튜닝 포인트 (인식률 우선값) ======
const ECC: 'L' | 'M' | 'Q' | 'H' = 'H'; // 최대 오류정정
const MARGIN = 4; // 조용한 여백(quiet zone)
const SCALE = 12; // 모듈 크기
const CHUNK_BYTES = 600; // 프레임당 바이트 (작게 쪼갤수록 인식↑)

// ====== 유틸 ======
function pct(n: number, d: number) {
  return ((100 * n) / d).toFixed(1) + '%';
}
function human(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
/** 문자열/ArrayBuffer/ArrayBufferView → Uint8Array */
function asU8(input: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
/** SHA-256(hex) */
function sha256hex(input: ArrayBuffer | ArrayBufferView | string): string {
  const bytes = asU8(input);
  return createHash('sha256')
    .update(bytes as unknown as BinaryLike)
    .digest('hex');
}
/** 16B 헤더: "CBR1"(4) + total(u16 BE) + index(u16 BE) + sha256prefix(8) */
function makeHeaderU8(
  total: number,
  index: number,
  sha256Prefix8: Uint8Array,
): Uint8Array {
  if (sha256Prefix8.byteLength < 8)
    throw new Error('sha256Prefix8 must be ≥ 8 bytes');
  const out = new Uint8Array(16);
  // "CBR1"
  out[0] = 0x43;
  out[1] = 0x42;
  out[2] = 0x52;
  out[3] = 0x31;
  // total/index (u16 BE)
  out[4] = (total >>> 8) & 0xff;
  out[5] = total & 0xff;
  out[6] = (index >>> 8) & 0xff;
  out[7] = index & 0xff;
  // 해시 prefix 8B
  out.set(sha256Prefix8.subarray(0, 8), 8);
  return out;
}

/** 인식률 강화 QR 생성(단일 시도 → 분할 생성) */
export async function emitQRCodesRobust(
  payload: Uint8Array,
  outDir = 'dist/out/qr',
  baseName = 'vp_cbor_gz',
) {
  mkdirSync(outDir, { recursive: true });

  // 복원 검증용 해시(표시용 hex + 헤더에 8바이트 prefix)
  const hashHex = sha256hex(payload);
  const hashFullBuf = createHash('sha256')
    .update(payload as unknown as BinaryLike)
    .digest();
  const hashPrefix8 = new Uint8Array(hashFullBuf.subarray(0, 8));

  // 1) 단일 QR 시도
  try {
    const segs: QRCodeSegment[] = [
      { data: makeHeaderU8(1, 0, hashPrefix8), mode: 'byte' },
      { data: payload, mode: 'byte' },
    ];
    await QRCode.toFile(`${outDir}/${baseName}.png`, segs, {
      errorCorrectionLevel: ECC,
      margin: MARGIN,
      scale: SCALE,
      type: 'png',
      // version: 15, // 필요 시 고정 버전 부여 가능 (기본은 자동 최적)
    });
    writeFileSync(
      `${outDir}/${baseName}.manifest.json`,
      JSON.stringify(
        {
          total: 1,
          hashHex,
          headerBytes: 16,
          ecc: ECC,
          margin: MARGIN,
          scale: SCALE,
        },
        null,
        2,
      ),
    );
    console.log(`🧾 QR(single): ${outDir}/${baseName}.png`);
    return;
  } catch (e: any) {
    if (!String(e?.message || e).includes('code length overflow')) throw e;
    console.log('ℹ️ Single QR overflow → chunking…');
  }

  // 2) 분할 QR (작은 고정 청크 → 인식률↑)
  const total = Math.ceil(payload.length / CHUNK_BYTES);
  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_BYTES;
    const end = Math.min(payload.length, start + CHUNK_BYTES);
    const chunk = payload.subarray(start, end);

    const segs: QRCodeSegment[] = [
      { data: makeHeaderU8(total, i, hashPrefix8), mode: 'byte' },
      { data: chunk, mode: 'byte' },
    ];

    const num = String(i + 1).padStart(String(total).length, '0');
    const path = `${outDir}/${baseName}_${num}of${total}.png`;
    await QRCode.toFile(path, segs, {
      errorCorrectionLevel: ECC,
      margin: MARGIN,
      scale: SCALE,
      type: 'png',
    });
    console.log(`🧾 QR: frame ${i + 1}/${total} → ${path}`);
  }

  writeFileSync(
    `${outDir}/${baseName}.manifest.json`,
    JSON.stringify(
      {
        total,
        hashHex,
        headerBytes: 16,
        ecc: ECC,
        margin: MARGIN,
        scale: SCALE,
        chunkBytes: CHUNK_BYTES,
      },
      null,
      2,
    ),
  );
  console.log(`🗂️  manifest → ${outDir}/${baseName}.manifest.json`);
}
