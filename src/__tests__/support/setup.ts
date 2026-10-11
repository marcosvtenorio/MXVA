import { afterEach } from "vitest";

afterEach(() => {
  // DOM tests start from empty browser storage.
  if (typeof window !== "undefined") {
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
});
