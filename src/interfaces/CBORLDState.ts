import { ContextEntry } from './contextEntry';

export interface CBORLDState {
  contextMap: Map<string, ContextEntry>;
  nextTermId: number;
  keywordsMap: Map<string, number>;
  termToId: Map<string, number>;
  idToTerm?: Map<number, string>;
  strategy: 'compression' | 'decompression';
  registryEntryId: number;
}
