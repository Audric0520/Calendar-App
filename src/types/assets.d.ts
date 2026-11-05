/**
 * Vite resolves static asset imports (`?url`, `*.png`, …) to string URLs at
 * build time. The project has no `vite/client` reference, so declare the
 * handful of forms actually used here.
 */

declare module '*.png?url' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg?url' {
  const src: string;
  export default src;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}
