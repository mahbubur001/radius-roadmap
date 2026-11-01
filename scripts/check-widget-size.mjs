// Fails the widget build when public/widget.js grows past its budget
// (doc 14: under ~15 KB gzipped; it loads on every page of customers' sites).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 15 * 1024;
const size = gzipSync(readFileSync("public/widget.js")).length;
if (size > LIMIT) {
  console.error(`widget.js is ${size} bytes gzipped (limit ${LIMIT}).`);
  process.exit(1);
}
console.info(`widget.js: ${(size / 1024).toFixed(1)} KB gzipped (limit 15 KB)`);
