/** JSON-serializable values — the contract for anything stored in a JSON column. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * Normalizes a validated object into a storable `JsonObject`, dropping
 * `undefined` and proving serializability at the persistence boundary.
 */
export function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}
