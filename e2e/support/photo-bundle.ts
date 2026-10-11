import path from "node:path";
import { rolldown } from "rolldown";

let cached: string | undefined;

/** Bundles the browser photo processor so tests can run it in a real engine. */
export async function photoProcessorBundle(): Promise<string> {
  if (cached) return cached;
  const input = path.resolve(__dirname, "../../src/features/photos/client-processor.ts");
  const bundle = await rolldown({ input, logLevel: "silent" });
  const { output } = await bundle.generate({ format: "iife", name: "MXVAPhoto" });
  await bundle.close();
  cached = output[0].code;
  return cached;
}
