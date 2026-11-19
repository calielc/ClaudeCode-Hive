import type { HiveApi } from "@shared/types";

declare global {
  interface Window {
    hive: HiveApi;
  }
}
