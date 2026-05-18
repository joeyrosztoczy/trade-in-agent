import vm from "node:vm";
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

for (const selector of [
  ".ti-topbar",
  ".ti-kpis",
  ".ti-panel",
  ".case-row",
  ".detail-actions",
  ".queue-search",
  ".workflow-strip",
  ".media-grid",
  ".packet-actions",
  ".action-history",
  ".evidence-modal"
]) {
  if (!allCss.includes(selector)) {
    throw new Error(`component CSS is missing ${selector}`);
  }
}

if (!demo.includes("TradeReviewDemoData")) {
  throw new Error("demo.js is not wired to demo data");
}

for (const behavior of ["copy_packet", "download_packet", "generate_packet", "data-preview-evidence", "data-search"]) {
  if (!demo.includes(behavior)) {
    throw new Error(`demo.js is missing ${behavior}`);
  }
}

if (demo.includes("Premier / Stotz Used Equipment") || demo.includes("Premier-Stotz Trade Desk")) {
  throw new Error("deployment-specific branding must not use the mixed Premier/Stotz label");
}

for (const behavior of ["currentDeploymentBrand", "ti-logout-button", "ti-logout-button__icon"]) {
  if (!demo.includes(behavior) && !allCss.includes(behavior)) {
    throw new Error(`deployment UI is missing ${behavior}`);
  }
}

const app = {
  _html: "",
  addEventListener() {},
  set innerHTML(value) {
    this._html = value;
  },
  get innerHTML() {
    return this._html;
  }
};
const context = {
  console,
  window: {
    location: { hostname: "localhost" },
    requestAnimationFrame(fn) { fn(); },
    addEventListener() {},
    setTimeout
  },
  document: {
    getElementById(id) { return id === "app" ? app : null; },
    querySelector() { return null; },
    createElement() {
      return { setAttribute() {}, style: {}, select() {}, remove() {}, click() {}, value: "", href: "", download: "" };
    },
    body: { appendChild() {} },
    execCommand() { return true; }
  },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  Blob,
  URL,
  setTimeout
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(readFileSync(join(root, "src/demo-data.js"), "utf8"), context, { filename: "demo-data.js" });
vm.runInContext(demo, context, { filename: "demo.js" });
if (!app.innerHTML.includes("review-shell") || !app.innerHTML.includes("Loading live review queue")) {
  throw new Error("demo.js did not render the startup skeleton shell");
}

if (/letter-spacing\s*:\s*-/.test(allCss)) {
  throw new Error("negative letter-spacing is not allowed");
}

console.log("Review UI smoke check passed.");
