export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && !/\.(tsx?|jsx?|json|mjs|cjs|node)$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(`${specifier}.tsx`, context);
    }
  }
  return nextResolve(specifier, context);
}
