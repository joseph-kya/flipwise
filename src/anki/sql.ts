import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
let sql: ReturnType<typeof initSqlJs> | undefined;
export const loadSQL = () =>
  (sql ??= initSqlJs({
    useOldExtensionFunctions: false,
    locateFile: () => wasmUrl,
  }));
