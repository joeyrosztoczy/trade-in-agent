import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const requiredFiles = [
  "index.html",
  "src/styles/index.css",
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/components.css",
  "src/styles/demo.css",
  "src/demo-data.js",
  "src/demo.js"
];

for (const file of requiredFiles) {
  statSync(join(root, file));
}

const index = readFileSync(join(root, "index.html"), "utf8");
const cssIndex = readFileSync(join(root, "src/styles/index.css"), "utf8");
const demo = readFileSync(join(root, "src/demo.js"), "utf8");
const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
const allCss = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/components.css",
  "src/styles/demo.css"
].map((file) => readFileSync(join(root, file), "utf8")).join("\n");

for (const reference of ["src/styles/index.css", "src/demo-data.js", "src/demo.js"]) {
  if (!index.includes(reference)) {
    throw new Error(`index.html is missing ${reference}`);
  }
}

for (const reference of ["tokens.css", "base.css", "components.css", "demo.css"]) {
  if (!cssIndex.includes(reference)) {
    throw new Error(`src/styles/index.css is missing ${reference}`);
  }
}

for (const token of ["--ti-color-brand", "--ti-color-signal", "--ti-layout-sidebar", "--ti-row-height"]) {
  if (!tokens.includes(token)) {
    throw new Error(`tokens.css is missing ${token}`);
  }
}

for (const selector of [".ti-topbar", ".ti-kpis", ".ti-panel", ".case-row", ".detail-actions"]) {
  if (!allCss.includes(selector)) {
    throw new Error(`component CSS is missing ${selector}`);
  }
}

if (!demo.includes("TradeReviewDemoData")) {
  throw new Error("demo.js is not wired to demo data");
}

if (/letter-spacing\s*:\s*-/.test(allCss)) {
  throw new Error("negative letter-spacing is not allowed");
}

console.log("Review UI smoke check passed.");

