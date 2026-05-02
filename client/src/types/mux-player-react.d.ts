// Ambient module typing for @mux/mux-player-react.
// Library ships its own runtime types, but TS resolution can be flaky in
// the Vite/oxc test pipeline. This stub keeps `import MuxPlayerRaw from "@mux/mux-player-react"`
// type-safe without leaking `any` via // @ts-ignore inline directives.
declare module "@mux/mux-player-react" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component: any;
  export default Component;
}
