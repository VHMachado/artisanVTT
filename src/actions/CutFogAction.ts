import polygonClipping from "polygon-clipping";
import type { Fog, FogState } from "../types/Fog";
import {
  addPolygonDifferenceToFog,
  addPolygonIntersectionToFog,
  fogToGeometry,
} from "../helpers/fog";
import Action from "./Action";

function splitFog(
  fog: Fog,
  cutters: ReturnType<typeof fogToGeometry>[],
  destination: FogState
) {
  const source = fogToGeometry(fog);
  addPolygonDifferenceToFog(
    fog,
    polygonClipping.difference(source, ...cutters),
    destination
  );
  addPolygonIntersectionToFog(
    fog,
    polygonClipping.intersection(source, ...cutters),
    destination
  );
}
class CutFogAction extends Action<FogState> {
  private readonly cutters: ReturnType<typeof fogToGeometry>[];
  constructor(fogs: Fog[]) {
    super();
    this.cutters = fogs.map(fogToGeometry);
  }
  update(existing: FogState): FogState {
    const result: FogState = {};
    for (const fog of Object.values(existing)) {
      try {
        splitFog(fog, this.cutters, result);
      } catch {
        console.error("Fog of war: falha ao cortar o fog");
      }
    }
    return result;
  }
}
export default CutFogAction;
