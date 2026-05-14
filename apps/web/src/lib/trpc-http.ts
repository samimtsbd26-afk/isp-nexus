import superjson from "superjson";

/** Request body / GET `input=` value for manual tRPC v11 HTTP calls (matches @trpc/client + superjson). */
export function trpcSerializeWire(input: unknown): string {
  return JSON.stringify(superjson.serialize(input));
}

/** Encode a query input segment for GET `?input=` (tRPC HTTP + superjson). */
export function trpcEncodeQueryInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify(superjson.serialize(input)));
}

/** Parse `response.result.data` from a successful tRPC JSON HTTP response. */
export function trpcDeserializeResultData<T>(resultData: unknown): T {
  return superjson.deserialize(resultData as never) as T;
}
