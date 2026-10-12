import { z } from "zod";

// Zod 4 probes `new Function("")` to decide whether to compile parsers. Our Content Security
// Policy forbids eval, so the probe only produces a CSP violation report. Interpreted parsing
// is fast enough here.
z.config({ jitless: true });
