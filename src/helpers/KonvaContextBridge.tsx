import React from "react";

import DatabaseContext, { useDatabase } from "../contexts/DatabaseContext";
import {
  GridCellNormalizedSizeContext,
  GridCellPixelOffsetContext,
  GridCellPixelSizeContext,
  GridContext,
  GridOffsetContext,
  GridPixelSizeContext,
  GridSnappingSensitivityContext,
  GridStrokeWidthContext,
  useGrid,
  useGridCellNormalizedSize,
  useGridCellPixelOffset,
  useGridCellPixelSize,
  useGridOffset,
  useGridPixelSize,
  useGridSnappingSensitivity,
  useGridStrokeWidth,
} from "../contexts/GridContext";
import { MapStageProvider, useMapStage } from "../contexts/MapStageContext";
import SettingsContext, { useSettings } from "../contexts/SettingsContext";

type StageRender = (wrapped: React.ReactNode) => React.ReactElement;

type KonvaBridgeProps = { stageRender: StageRender; children: React.ReactNode };

type CanvasContextsProps = {
  children: React.ReactNode;
  mapStageRef: ReturnType<typeof useMapStage>;
  settings: ReturnType<typeof useSettings>;
  database: ReturnType<typeof useDatabase>;
  grid: ReturnType<typeof useGrid>;
  gridPixelSize: ReturnType<typeof useGridPixelSize>;
  gridCellNormalizedSize: ReturnType<typeof useGridCellNormalizedSize>;
  gridCellPixelSize: ReturnType<typeof useGridCellPixelSize>;
  gridStrokeWidth: ReturnType<typeof useGridStrokeWidth>;
  gridCellPixelOffset: ReturnType<typeof useGridCellPixelOffset>;
  gridOffset: ReturnType<typeof useGridOffset>;
  gridSnappingSensitivity: ReturnType<typeof useGridSnappingSensitivity>;
};

function CanvasContexts({ children, ...values }: CanvasContextsProps): React.ReactElement {
  return (
    <DatabaseContext.Provider value={values.database}>
      <SettingsContext.Provider value={values.settings}>
        <MapStageProvider value={values.mapStageRef}>
          <GridContext.Provider value={values.grid}>
            <GridPixelSizeContext.Provider value={values.gridPixelSize}>
              <GridCellNormalizedSizeContext.Provider value={values.gridCellNormalizedSize}>
                <GridCellPixelSizeContext.Provider value={values.gridCellPixelSize}>
                  <GridStrokeWidthContext.Provider value={values.gridStrokeWidth}>
                    <GridCellPixelOffsetContext.Provider value={values.gridCellPixelOffset}>
                      <GridOffsetContext.Provider value={values.gridOffset}>
                        <GridSnappingSensitivityContext.Provider value={values.gridSnappingSensitivity}>
                          {children}
                        </GridSnappingSensitivityContext.Provider>
                      </GridOffsetContext.Provider>
                    </GridCellPixelOffsetContext.Provider>
                  </GridStrokeWidthContext.Provider>
                </GridCellPixelSizeContext.Provider>
              </GridCellNormalizedSizeContext.Provider>
            </GridPixelSizeContext.Provider>
          </GridContext.Provider>
        </MapStageProvider>
      </SettingsContext.Provider>
    </DatabaseContext.Provider>
  );
}

export default function KonvaBridge({ stageRender, children }: KonvaBridgeProps): React.ReactElement {
  return stageRender(
    <CanvasContexts
      mapStageRef={useMapStage()}
      settings={useSettings()}
      database={useDatabase()}
      grid={useGrid()}
      gridPixelSize={useGridPixelSize()}
      gridCellNormalizedSize={useGridCellNormalizedSize()}
      gridCellPixelSize={useGridCellPixelSize()}
      gridStrokeWidth={useGridStrokeWidth()}
      gridCellPixelOffset={useGridCellPixelOffset()}
      gridOffset={useGridOffset()}
      gridSnappingSensitivity={useGridSnappingSensitivity()}
    >
      {children}
    </CanvasContexts>
  );
}
