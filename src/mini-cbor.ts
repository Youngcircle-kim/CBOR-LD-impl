// mini-cbor.ts — no deps

type EncodeOpts = {
  /** "0", "1" 같은 문자열 키를 CBOR 맵의 "정수 키"로 인코딩할지 (기본 true) */
  numericStringKeysAsInts?: boolean;
};
type DecodeOpts = {
  /** true면 JS Map을 반환(숫자 키 유지). false면 평범한 객체 반환(숫자 키는 "0"처럼 문자열화) */
  mapsAsMaps?: boolean;
};

const enum Major {
  Unsigned = 0, // 0
  Negative = 1, // 1
  ByteString = 2, // 2
  TextString = 3, // 3
  Array = 4, // 4
  Map = 5, // 5
  Tag = 6, // 6
  SimpleFloat = 7, // 7
}

export function cborEncode(input: any, opts: EncodeOpts = {}): Uint8Array {
  const state = new EncoderState(opts);
  state.encodeAny(input);
  return state.toUint8Array();
}

export function cborDecode(bytes: Uint8Array, opts: DecodeOpts = {}): any {
  const state = new DecoderState(bytes, opts);
  const value = state.decodeAny();
  if (!state.eof()) throw new Error('Extra bytes after CBOR item');
  return value;
}

/* ---------------- Encoder ---------------- */

class EncoderState {
  private chunks: number[] = [];
  private textEncoder = new TextEncoder();
  private opts: Required<EncodeOpts>;

  constructor(opts: EncodeOpts) {
    this.opts = { numericStringKeysAsInts: true, ...opts };
  }

  toUint8Array() {
    return Uint8Array.from(this.chunks);
  }

  private pushByte(b: number) {
    this.chunks.push(b & 0xff);
  }
  private pushBytes(arr: number[] | Uint8Array) {
    for (const b of arr as any) this.pushByte(b);
  }

  private writeTypeLen(major: Major, len: number | bigint) {
    const m = (major & 0x7) << 5;
    if (typeof len === 'number') {
      if (len < 24) {
        this.pushByte(m | len);
      } else if (len < 0x100) {
        this.pushByte(m | 24);
        this.pushByte(len);
      } else if (len < 0x10000) {
        this.pushByte(m | 25);
        this.pushBytes([(len >> 8) & 0xff, len & 0xff]);
      } else if (len <= 0xffffffff) {
        this.pushByte(m | 26);
        this.pushBytes([
          (len >>> 24) & 0xff,
          (len >>> 16) & 0xff,
          (len >>> 8) & 0xff,
          len & 0xff,
        ]);
      } else {
        // JS number can’t represent > 2^53-1 safely → coerce to BigInt
        this.writeTypeLen(major, BigInt(len));
      }
    } else {
      // BigInt
      this.pushByte(m | 27);
      const b = bigIntTo8Bytes(len);
      this.pushBytes(b);
    }
  }

  private writeUInt(n: number | bigint) {
    if (typeof n === 'number') {
      if (!Number.isFinite(n) || n < 0) throw new Error('writeUInt: invalid');
      this.writeTypeLen(Major.Unsigned, n);
    } else {
      if (n < 0n) throw new Error('writeUInt: negative bigint');
      this.writeTypeLen(Major.Unsigned, n);
    }
  }

  private writeNInt(n: number | bigint) {
    // CBOR neg int encodes value = -1 - n  (n >= 0)
    if (typeof n === 'number') {
      if (!Number.isFinite(n) || n >= 0) throw new Error('writeNInt: invalid');
      const m = -1 - Math.trunc(n);
      this.writeTypeLen(Major.Negative, m);
    } else {
      if (n >= 0n) throw new Error('writeNInt: invalid');
      const m = -1n - n;
      this.writeTypeLen(Major.Negative, m);
    }
  }

  private writeFloat64(num: number) {
    // major 7, addInfo 27 + 8 bytes
    this.pushByte((Major.SimpleFloat << 5) | 27);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, num, false);
    this.pushBytes(new Uint8Array(buf));
  }

  private writeText(s: string) {
    const enc = this.textEncoder.encode(s);
    this.writeTypeLen(Major.TextString, enc.length);
    this.pushBytes(enc);
  }

  private writeBytes(bin: Uint8Array) {
    this.writeTypeLen(Major.ByteString, bin.length);
    this.pushBytes(bin);
  }

  encodeAny(v: any) {
    if (v === null) {
      this.pushByte(0xf6);
      return;
    } // null
    if (v === undefined) {
      this.pushByte(0xf7);
      return;
    } // undefined
    if (v === false) {
      this.pushByte(0xf4);
      return;
    } // false
    if (v === true) {
      this.pushByte(0xf5);
      return;
    } // true

    switch (typeof v) {
      case 'number': {
        if (Number.isInteger(v)) {
          if (v >= 0) this.writeUInt(v);
          else this.writeNInt(v);
        } else {
          this.writeFloat64(v);
        }
        return;
      }
      case 'bigint': {
        if (v >= 0n) this.writeUInt(v);
        else this.writeNInt(v);
        return;
      }
      case 'string': {
        this.writeText(v);
        return;
      }
      case 'object': {
        if (v instanceof Uint8Array) {
          this.writeBytes(v);
          return;
        }
        if (Array.isArray(v)) {
          this.writeTypeLen(Major.Array, v.length);
          for (const x of v) this.encodeAny(x);
          return;
        }
        if (v instanceof Map) {
          this.writeTypeLen(Major.Map, v.size);
          for (const [k, val] of v.entries()) {
            this.encodeAny(k);
            this.encodeAny(val);
          }
          return;
        }
        // plain object → map
        const entries = Object.entries(v);
        this.writeTypeLen(Major.Map, entries.length);
        for (const [k, val] of entries) {
          // "0","1" 같은 키를 정수키로 인코딩
          if (this.opts.numericStringKeysAsInts && isUintString(k)) {
            this.writeUInt(Number(k));
          } else {
            this.writeText(k);
          }
          this.encodeAny(val);
        }
        return;
      }
      default:
        throw new Error(`Unsupported type: ${typeof v}`);
    }
  }
}

function isUintString(s: string) {
  // 0 또는 0이 아닌 숫자열 (선행 0 허용)
  return /^[0-9]+$/.test(s);
}
function bigIntTo8Bytes(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/* ---------------- Decoder ---------------- */

class DecoderState {
  private dv: DataView;
  private idx = 0;
  private textDecoder = new TextDecoder();
  private opts: Required<DecodeOpts>;

  constructor(
    private buf: Uint8Array,
    opts: DecodeOpts,
  ) {
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.opts = { mapsAsMaps: false, ...opts };
  }

  eof() {
    return this.idx >= this.buf.length;
  }

  private readByte(): number {
    if (this.idx >= this.buf.length) throw new Error('Unexpected EOF');
    return this.buf[this.idx++];
  }

  private readN(n: number): Uint8Array {
    if (this.idx + n > this.buf.length) throw new Error('Unexpected EOF');
    const slice = this.buf.subarray(this.idx, this.idx + n);
    this.idx += n;
    return slice;
  }

  private readUInt(addInfo: number): number | bigint {
    if (addInfo < 24) return addInfo;
    switch (addInfo) {
      case 24:
        return this.readByte();
      case 25: {
        const b = this.readN(2);
        return (b[0] << 8) | b[1];
      }
      case 26: {
        const b = this.readN(4);
        return b[0] * 2 ** 24 + (b[1] << 16) + (b[2] << 8) + b[3];
      }
      case 27: {
        const b = this.readN(8);
        let n = 0n;
        for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(b[i]);
        return n;
      }
      default:
        throw new Error(`Invalid additional info: ${addInfo}`);
    }
  }

  private toNeg(n: number | bigint): number | bigint {
    // decode of major 1: value = -1 - n
    return typeof n === 'number' ? -1 - n : -1n - n;
  }

  decodeAny(): any {
    const ib = this.readByte();
    const major = ib >> 5;
    const ai = ib & 0x1f;

    switch (major) {
      case Major.Unsigned: {
        return this.readUInt(ai);
      }
      case Major.Negative: {
        const n = this.readUInt(ai);
        return this.toNeg(n);
      }
      case Major.ByteString: {
        const len = this.readUInt(ai);
        const n = asNum(len);
        const bytes = this.readN(n);
        return new Uint8Array(bytes); // copy not necessary
      }
      case Major.TextString: {
        const len = asNum(this.readUInt(ai));
        const bytes = this.readN(len);
        return this.textDecoder.decode(bytes);
      }
      case Major.Array: {
        const len = asNum(this.readUInt(ai));
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.decodeAny();
        return arr;
      }
      case Major.Map: {
        const len = asNum(this.readUInt(ai));
        if (this.opts.mapsAsMaps) {
          const m = new Map<any, any>();
          for (let i = 0; i < len; i++) {
            const k = this.decodeAny();
            const v = this.decodeAny();
            m.set(k, v);
          }
          return m;
        } else {
          const obj: any = {};
          for (let i = 0; i < len; i++) {
            const k = this.decodeAny();
            const v = this.decodeAny();
            // 정수 키라면 "0" 같은 문자열 키로 넣어준다(우리 restoreDictionaryKeys와 호환)
            const key =
              typeof k === 'bigint'
                ? k.toString()
                : typeof k === 'number'
                  ? String(k)
                  : typeof k === 'string'
                    ? k
                    : JSON.stringify(k);
            obj[key] = v;
          }
          return obj;
        }
      }
      case Major.Tag: {
        // 태그는 이번 구현에서 패스하고, 태그된 값만 읽어 반환
        const _tag = this.readUInt(ai); // 버림
        const inner = this.decodeAny();
        return inner;
      }
      case Major.SimpleFloat: {
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22) return null;
        if (ai === 23) return undefined;
        if (ai === 24) {
          // 1바이트 simple value
          const _sv = this.readByte(); // 여기선 미사용
          return null; // 필요하면 확장
        }
        if (ai === 25) {
          // float16 (생략)
          const _ = this.readN(2);
          // 간단히 float64로 승격해서 처리하려면 여기에 로직 작성
          throw new Error('float16 not supported');
        }
        if (ai === 26) {
          // float32
          const b = this.readN(4);
          const dv = new DataView(b.buffer, b.byteOffset, 4);
          return dv.getFloat32(0, false);
        }
        if (ai === 27) {
          // float64
          const b = this.readN(8);
          const dv = new DataView(b.buffer, b.byteOffset, 8);
          return dv.getFloat64(0, false);
        }
        throw new Error(`Unknown simple/float additional info: ${ai}`);
      }
      default:
        throw new Error(`Unknown major type: ${major}`);
    }
  }
}

function asNum(n: number | bigint): number {
  if (typeof n === 'number') return n;
  const x = Number(n);
  if (!Number.isSafeInteger(x)) throw new Error('Length > MAX_SAFE_INTEGER');
  return x;
}
