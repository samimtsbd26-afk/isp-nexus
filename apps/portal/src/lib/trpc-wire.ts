import superjson from "superjson";

export function trpcSerializeWire(input: unknown): string {
  return JSON.stringify(superjson.serialize(input));
}

export function trpcEncodeQueryInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify(superjson.serialize(input)));
}

export function trpcDeserializeResultData<T>(resultData: unknown): T {
  return superjson.deserialize(resultData as never) as T;
}

/** Handle a parsed tRPC HTTP JSON envelope (single procedure). */
export function trpcParseResponse<T>(data: Record<string, unknown>): T {
  if (data.error) {
    const e = data.error as { message?: string; json?: { message?: string } };
    throw new Error(e.message ?? e.json?.message ?? JSON.stringify(data.error));
  }
  if (!("result" in data) || (data.result as Record<string, unknown>)?.data === undefined) throw new Error("Invalid response");
  return trpcDeserializeResultData<T>((data.result as { data: unknown }).data);
}
