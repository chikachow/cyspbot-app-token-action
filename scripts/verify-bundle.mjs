import { isBuiltin } from "node:module";

function walk(node, visit, parent) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, parent));
    return;
  }
  visit(node, parent);
  for (const value of Object.values(node)) walk(value, visit, node);
}

// Inspect final output, including code from dependencies and bundler shims.
export function verifyBundle() {
  return {
    name: "verify-action-bundle",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const files = Object.values(bundle);
        if (files.length !== 1 || files[0].type !== "chunk" || files[0].fileName !== "index.js") {
          this.error("The action must be a single dist/index.js bundle");
        }
        const ast = this.parse(files[0].code);
        const factories = new Set();
        const loaders = new Set(["require"]);
        const factoryCalls = new Set();
        const unsupported = () => this.error("Unsupported module loader use in the action bundle");
        const checkSource = (source, namedImport = false) => {
          if (
            source?.type !== "Literal" ||
            typeof source.value !== "string" ||
            !isBuiltin(source.value) ||
            (!namedImport && ["module", "node:module"].includes(source.value))
          ) {
            this.error("The action bundle may only load literal Node built-in modules");
          }
        };

        for (const node of ast.body) {
          if (
            node.type !== "ImportDeclaration" ||
            !["module", "node:module"].includes(node.source.value)
          )
            continue;
          for (const specifier of node.specifiers) {
            // Namespace/default imports can hide createRequire or Module._load.
            if (
              specifier.type !== "ImportSpecifier" ||
              ["Module", "default", "_load"].includes(specifier.imported.name)
            )
              unsupported();
            if (specifier.imported.name === "createRequire") factories.add(specifier.local.name);
          }
        }
        const isFactoryCall = (node) =>
          node?.type === "CallExpression" &&
          node.callee.type === "Identifier" &&
          factories.has(node.callee.name);
        walk(ast, (node, parent) => {
          if (isFactoryCall(node) && parent?.type === "CallExpression" && parent.callee === node) {
            factoryCalls.add(node);
            checkSource(parent.arguments[0]);
          }
          if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier") return;
          let factory = node.init;
          // Rolldown wraps createRequire in an IIFE; its binding name may change.
          if (
            factory?.type === "CallExpression" &&
            factory.callee.type === "ArrowFunctionExpression"
          ) {
            factory = factory.callee.body;
          }
          if (isFactoryCall(factory)) {
            loaders.add(node.id.name);
            factoryCalls.add(factory);
          }
        });
        walk(ast, (node, parent) => {
          if (
            node.type === "ImportDeclaration" ||
            node.type === "ExportAllDeclaration" ||
            (node.type === "ExportNamedDeclaration" && node.source)
          )
            checkSource(node.source, node.type === "ImportDeclaration");
          if (node.type === "ImportExpression") checkSource(node.source);
          if (node.type !== "Identifier") return;
          // Noncomputed property names are not references to the loader binding.
          if (
            (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
            (parent?.type === "Property" &&
              parent.key === node &&
              !parent.computed &&
              !parent.shorthand)
          )
            return;
          if (factories.has(node.name)) {
            if (parent?.type === "ImportSpecifier") return;
            if (parent?.callee !== node || !factoryCalls.has(parent)) unsupported();
          }
          if (loaders.has(node.name)) {
            if (parent?.type === "VariableDeclarator" && parent.id === node) return;
            if (parent?.type !== "CallExpression" || parent.callee !== node) unsupported();
            checkSource(parent.arguments[0]);
          }
        });
      },
    },
  };
}
