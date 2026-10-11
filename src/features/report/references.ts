import registryJson from "@/data/evidence-sources.json";
import { evidenceRegistrySchema, type EvidenceSource } from "./schema";

/** The curated bibliography. Parsed once; an invalid file fails loudly at startup and in tests. */
export const EVIDENCE_REGISTRY = evidenceRegistrySchema.parse(registryJson);

const byId = new Map<string, EvidenceSource>(EVIDENCE_REGISTRY.sources.map((source) => [source.id, source]));

export function getSource(id: string): EvidenceSource {
  const source = byId.get(id);
  if (!source) throw new Error(`Unknown evidence source id: ${id}`);
  return source;
}

export function hasSource(id: string): boolean {
  return byId.has(id);
}

/** Only ids from the registry survive; anything else (e.g. model output) is dropped. */
export function onlyRegisteredIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(hasSource))];
}
