/** @type {import('next').NextConfig} */
const nextConfig = {
  // ponytail: wasm is loaded via dynamic import with a TS fallback (lib/wasm.ts),
  // so no special webpack/asyncWebAssembly config is needed here.
};
export default nextConfig;
