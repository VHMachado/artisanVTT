/**
 * Compatibility entry point for the token transform layer.
 * The implementation has its own module because it combines imperative Konva
 * lifecycle code with the declarative token renderer.
 */
export { CustomTransformer, default } from "./TokenTransformer";
