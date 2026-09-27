// Child process: server-renders one REAL exported component with JSON props
// and prints the HTML. A separate process for the same reason as
// render-analysis-view.ts - run-all uses the react-server condition, under
// which react-dom/server refuses to load.
//
// Usage: tsx render-component.ts <module path from repo root> <export name> '<props JSON>'
import React from "react";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

async function main() {
  const [modulePath, exportName, propsJson] = process.argv.slice(2);
  const mod = (await import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href)) as Record<string, React.ComponentType<Record<string, unknown>>>;
  const Component = mod[exportName];
  if (!Component) throw new Error(`${modulePath} has no export ${exportName}`);
  process.stdout.write(renderToStaticMarkup(React.createElement(Component, JSON.parse(propsJson ?? "{}"))));
}

void main();
