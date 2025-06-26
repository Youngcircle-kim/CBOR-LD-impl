import { TermDefinition } from "./termDefinition";

export interface ContextEntry {
  context: Record<string, any>;
  termMap: Record<string, TermDefinition>;
}
