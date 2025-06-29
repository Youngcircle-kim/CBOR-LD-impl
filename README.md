# CBOR-LD-impl
CBOR-LD implementation using typescript

# [CBOR-LD](https://json-ld.github.io/cbor-ld-spec/#create-context-encoder)
: Compact Binary data serialization and messaging format in Linked Data

## Component
1. JsonLdContextLoader : @context에서 state를 구성
2. JsonLdContextParser : @context에서 term-definition 추출
3. TypeTableBuilder : @context 기반 term -> integer 매핑 생성
4. Canonicalizer : JSON-LD를 정규화된 Key 순서의 구조로 정렬
5. CBORCodec : CBOR binary encoding
6. CBORLDEncoder : context 기반 term을 ID로 변환하여 CBOR 구조 생성
7. CBORLDDecoder : CBOR 구조를 context 기반 term으로 되돌림
8. CBORLDRegistry : registryEntryId -> typeTable 및 processing model 매핑
9. BitstringCompressor : Gzip 기반 bitstring 압축 구현
10. BitstringDecompressor : 압축 해제 구현

## Progress
- [X] JsonLdContextLoader
- [X] JsonLdContextParser
- [ ] TypeTableBuilder
- [ ] Canonicalizer
- [ ] CBORCodec
- [ ] CBORLDEncoder
- [ ] CBORLDDecoder
- [ ] CBORLDRegistry
- [ ] BitstringCompressor
- [ ] BitstringDecompressor

## Algorithm
### JSON-LD to CBOR-LD (Encoding)
1. Parse @context and extract term definitions.
2. Build a type table from term definitions.
3. Canonicalize JSON-LD (sorted key order).
4. Replace terms with integer mappings.
5. Encode the result to CBOR.
6. Prepend varint prefix using registryEntryId.

### CBOR-LD to JSON-LD (Decoding)
1. Extract varint prefix to determine registryEntryId.
2. Load type table using CBOR-LD Registry.
3. Decode CBOR binary to canonicalized map.
4. Replace integer keys with original terms using the type table.
5. Reconstruct JSON-LD document.
