// Teaches plain `node --test` the "@/..." alias that jsconfig.json gives
// the Next build, so the lib modules can be tested without a server.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./alias-loader.mjs", import.meta.url), pathToFileURL("./"));
