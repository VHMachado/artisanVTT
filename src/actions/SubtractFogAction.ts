import polygonClipping from "polygon-clipping";
import type { Fog, FogState } from "../types/Fog";
import { addPolygonDifferenceToFog, fogToGeometry } from "../helpers/fog";
import Action from "./Action";

function subtractFromFog(
  fog: Fog,
  masks: ReturnType<typeof fogToGeometry>[],
  destination: FogState
) {
  const difference = polygonClipping.difference(fogToGeometry(fog), ...masks);
  addPolygonDifferenceToFog(fog, difference, destination);
}
class SubtractFogAction extends Action<FogState> {
  private readonly masks: ReturnType<typeof fogToGeometry>[];
  constructor(erasers: Fog[]) {
    super();
    this.masks = erasers.map(fogToGeometry);
  }
  update(existing: FogState): FogState {
    const remaining: FogState = {};
    for (const fog of Object.values(existing)) {
      try {
        subtractFromFog(fog, this.masks, remaining);
      } catch {
        console.error("Fog of war: falha ao subtrair área do fog");
      }
    }
    return remaining;
  }
}
export default SubtractFogAction;
