declare module "intersection-observer" /* browser observer shim */;
declare module "pepjs" /* pointer event shim */;
declare module "socket.io-msgpack-parser" /* message codec without typings */;
declare module "fake-indexeddb" /* test IndexedDB implementation */;
declare module "fake-indexeddb/lib/FDBKeyRange" /* test key-range implementation */;
declare module "react-router-hash-link" /* router extension without typings */;
declare module "ammo.js/builds/ammo.wasm.js" /* WASM loader bridge */;

declare module "*.bin" {
  const assetUrl: string;
  export default assetUrl;
}

declare module "*.mp4" {
  const assetUrl: string;
  export default assetUrl;
}

declare module "*.png" {
  const assetUrl: string;
  export default assetUrl;
}

declare module "*.wasm?url" {
  const assetUrl: string;
  export default assetUrl;
}
