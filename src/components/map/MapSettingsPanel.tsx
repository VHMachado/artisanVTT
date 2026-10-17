import { useEffect, useRef, useState } from "react";
import { Flex, Box, Label, Input, Checkbox, Button } from "theme-ui";

import { isEmpty } from "../../helpers/shared";
import { getGridDetectionFromImage, getGridDetectionInset, getGridUpdatedInset } from "../../helpers/grid";

import { useDataURL } from "../../contexts/AssetsContext";
import { mapSources as defaultMapSources } from "../../maps";

import Divider from "../Divider";
import Select from "../Select";
import { Map, MapQuality } from "../../types/Map";
import { EditFlag, MapState } from "../../types/MapState";
import {
  MapSettingsChangeEventHandler,
  MapStateSettingsChangeEventHandler,
} from "../../types/Events";
import { Grid, GridMeasurementType, GridType } from "../../types/Grid";

type QualityOption = { value: MapQuality; label: string };
const qualityOptions: QualityOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra High" },
  { value: "original", label: "Original" },
];

type GridTypeOption = { value: GridType; label: string };
const gridTypeOptions: GridTypeOption[] = [
  { value: "square", label: "Square" },
  { value: "hexVertical", label: "Hex Vertical" },
  { value: "hexHorizontal", label: "Hex Horizontal" },
];

type GridMeasurementTypeOption = { value: GridMeasurementType; label: string };
const squareMeasurementOptions: GridMeasurementTypeOption[] = [
  { value: "chebyshev", label: "Chessboard (D&D 5e)" },
  { value: "alternating", label: "Alternating Diagonal (D&D 3.5e)" },
  { value: "euclidean", label: "Euclidean" },
  { value: "manhattan", label: "Manhattan" },
];
const hexMeasurementOptions: GridMeasurementTypeOption[] = [
  { value: "manhattan", label: "Manhattan" },
  { value: "euclidean", label: "Euclidean" },
];

type MapSettingsProps = {
  map: Map;
  mapState: MapState;
  onSettingsChange: MapSettingsChangeEventHandler;
  onStateSettingsChange: MapStateSettingsChangeEventHandler;
};

/** The grid/quality/edit-permission form shown in the map edit modal */
function MapSettings({
  map,
  mapState,
  onSettingsChange,
  onStateSettingsChange,
}: MapSettingsProps) {
  const mapEmpty = !map || isEmpty(map);
  const mapStateEmpty = !mapState || isEmpty(mapState);

  function handleFlagChange(
    event: React.ChangeEvent<HTMLInputElement>,
    flag: EditFlag
  ) {
    const editFlags = event.target.checked
      ? [...mapState.editFlags, flag]
      : mapState.editFlags.filter((f) => f !== flag);
    onStateSettingsChange({ editFlags });
  }

  function withUpdatedInset(grid: Grid): Grid {
    return { ...grid, inset: getGridUpdatedInset(grid, map.width, map.height) };
  }

  function handleGridSizeXChange(event: React.ChangeEvent<HTMLInputElement>) {
    const x = parseInt(event.target.value) || 0;
    const grid = withUpdatedInset({ ...map.grid, size: { ...map.grid.size, x } });
    onSettingsChange({ grid });
  }

  function handleGridSizeYChange(event: React.ChangeEvent<HTMLInputElement>) {
    const y = parseInt(event.target.value) || 0;
    const grid = withUpdatedInset({ ...map.grid, size: { ...map.grid.size, y } });
    onSettingsChange({ grid });
  }

  function handleGridTypeChange(option: GridTypeOption | null) {
    if (!option) {
      return;
    }
    const type = option.value;
    const grid = withUpdatedInset({
      ...map.grid,
      type,
      measurement: {
        ...map.grid.measurement,
        type: type === "square" ? "chebyshev" : "manhattan",
      },
    });
    onSettingsChange({ grid });
  }

  function handleGridMeasurementTypeChange(
    option: GridMeasurementTypeOption | null
  ) {
    if (!option) {
      return;
    }
    onSettingsChange({
      grid: {
        ...map.grid,
        measurement: { ...map.grid.measurement, type: option.value },
      },
    });
  }

  function handleGridMeasurementScaleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    onSettingsChange({
      grid: {
        ...map.grid,
        measurement: { ...map.grid.measurement, scale: event.target.value },
      },
    });
  }

  function handleQualityChange(option: QualityOption | null) {
    if (option) {
      onSettingsChange({ quality: option.value });
    }
  }

  const mapURL = useDataURL(map, defaultMapSources);
  const [mapSizeMB, setMapSizeMB] = useState(0);
  const [detectingGrid, setDetectingGrid] = useState(false);
  const [gridDetectionMessage, setGridDetectionMessage] = useState<string>();
  const gridDetectionRequest = useRef(0);
  const currentMap = useRef(map);
  currentMap.current = map;

  useEffect(() => {
    gridDetectionRequest.current++;
    setDetectingGrid(false);
    setGridDetectionMessage(undefined);
    return () => {
      gridDetectionRequest.current++;
    };
  }, [map.id, mapURL]);

  async function handleDetectFloorGrid() {
    if (mapEmpty || !mapURL) return;

    const request = ++gridDetectionRequest.current;
    setDetectingGrid(true);
    setGridDetectionMessage(undefined);
    const image = new Image();
    image.onload = () => {
      if (request !== gridDetectionRequest.current) return;
      try {
        const detection = getGridDetectionFromImage(image);
        if (!detection) {
          setGridDetectionMessage("No repeated square floor tiles found.");
          return;
        }
        // The modal can rerender with an unsaved edit while image decoding is
        // in flight. Preserve those latest settings and replace only the grid
        // geometry inferred from the image.
        const latestMap = currentMap.current;
        const grid: Grid = {
          ...latestMap.grid,
          type: "square",
          size: detection.size,
          measurement: { ...latestMap.grid.measurement, type: "chebyshev" },
        };
        grid.inset = getGridDetectionInset(detection, latestMap.width, latestMap.height);
        onSettingsChange({ grid });
        setGridDetectionMessage(`Detected ${detection.size.x} columns × ${detection.size.y} rows.`);
      } catch {
        setGridDetectionMessage("Could not read this map image.");
      } finally {
        setDetectingGrid(false);
      }
    };
    image.onerror = () => {
      if (request !== gridDetectionRequest.current) return;
      setGridDetectionMessage("Could not load this map image.");
      setDetectingGrid(false);
    };
    image.src = mapURL;
  }

  useEffect(() => {
    async function updateMapSize() {
      if (!mapURL) {
        setMapSizeMB(0);
        return;
      }
      const response = await fetch(mapURL);
      const blob = await response.blob();
      setMapSizeMB(parseFloat((blob.size / 1_000_000).toFixed(2)));
    }
    updateMapSize();
  }, [mapURL]);

  return (
    <Flex sx={{ flexDirection: "column" }}>
      <Flex>
        <Box mt={2} mr={1} sx={{ flexGrow: 1 }}>
          <Label htmlFor="gridX">Columns</Label>
          <Input
            type="number"
            name="gridX"
            value={`${(map && map.grid.size.x) || 0}`}
            onChange={handleGridSizeXChange}
            disabled={mapEmpty}
            min={1}
            my={1}
          />
        </Box>
        <Box mt={2} ml={1} sx={{ flexGrow: 1 }}>
          <Label htmlFor="gridY">Rows</Label>
          <Input
            type="number"
            name="gridY"
            value={`${(map && map.grid.size.y) || 0}`}
            onChange={handleGridSizeYChange}
            disabled={mapEmpty}
            min={1}
            my={1}
          />
        </Box>
      </Flex>
      <Box mt={2}>
        <Button
          type="button"
          onClick={handleDetectFloorGrid}
          disabled={mapEmpty || !mapURL || detectingGrid}
        >
          {detectingGrid ? "Detecting floor tiles…" : "Detect floor grid"}
        </Button>
        {gridDetectionMessage && (
          <Box mt={1} sx={{ fontSize: 0 }} aria-live="polite">
            {gridDetectionMessage}
          </Box>
        )}
      </Box>
      <Box mt={2} sx={{ flexGrow: 1 }}>
        <Label htmlFor="name">Name</Label>
        <Input
          name="name"
          value={(map && map.name) || ""}
          onChange={(e) => onSettingsChange({ name: e.target.value })}
          disabled={mapEmpty}
          my={1}
        />
      </Box>
      <Flex
        mt={2}
        mb={mapEmpty || map.type === "default" ? 2 : 0}
        sx={{ flexDirection: "column" }}
      >
        <Flex sx={{ alignItems: "flex-end" }}>
          <Box sx={{ width: "50%" }}>
            <Label>Grid Type</Label>
            <Select
              isDisabled={mapEmpty}
              options={gridTypeOptions}
              value={
                mapEmpty
                  ? undefined
                  : gridTypeOptions.find((o) => o.value === map.grid.type)
              }
              onChange={handleGridTypeChange as any}
              isSearchable={false}
            />
          </Box>
          <Flex sx={{ flexGrow: 1, flexDirection: "column" }} ml={2}>
            <Label>
              <Checkbox
                checked={!mapEmpty && map.showGrid}
                disabled={mapEmpty}
                onChange={(e) =>
                  onSettingsChange({ showGrid: e.target.checked })
                }
              />
              Draw Grid
            </Label>
            <Label>
              <Checkbox
                checked={!mapEmpty && map.snapToGrid}
                disabled={mapEmpty}
                onChange={(e) =>
                  onSettingsChange({ snapToGrid: e.target.checked })
                }
              />
              Snap to Grid
            </Label>
          </Flex>
        </Flex>
        <Flex sx={{ alignItems: "flex-end" }}>
          <Box my={2} sx={{ width: "50%" }}>
            <Label>Grid Measurement</Label>
            <Select
              isDisabled={mapEmpty}
              options={
                map && map.grid.type === "square"
                  ? squareMeasurementOptions
                  : hexMeasurementOptions
              }
              value={
                mapEmpty
                  ? undefined
                  : squareMeasurementOptions.find(
                      (o) => o.value === map.grid.measurement.type
                    )
              }
              onChange={handleGridMeasurementTypeChange as any}
              isSearchable={false}
            />
          </Box>
          <Box m={2} mr={0} sx={{ flexGrow: 1 }}>
            <Label htmlFor="gridMeasurementScale">Grid Scale</Label>
            <Input
              name="gridMeasurementScale"
              value={`${map && map.grid.measurement.scale}`}
              onChange={handleGridMeasurementScaleChange}
              disabled={mapEmpty}
              min={1}
              my={1}
              autoComplete="off"
            />
          </Box>
        </Flex>
      </Flex>
      {!mapEmpty && map.type !== "default" && (
        <Flex my={2} sx={{ alignItems: "center" }}>
          <Box mb={1} sx={{ width: "50%" }}>
            <Label>Quality</Label>
            <Select
              options={qualityOptions}
              value={
                mapEmpty
                  ? undefined
                  : qualityOptions.find((o) => o.value === map.quality)
              }
              isDisabled={mapEmpty}
              onChange={handleQualityChange as any}
              isOptionDisabled={
                ((option: QualityOption) =>
                  mapEmpty ||
                  (option.value !== "original" &&
                    !map.resolutions[option.value])) as any
              }
              isSearchable={false}
            />
          </Box>
          <Label sx={{ width: "50%" }} ml={2}>
            Size: {mapSizeMB > 0 && `${mapSizeMB}MB`}
          </Label>
        </Flex>
      )}
      <Divider fill />
      <Box my={2} sx={{ flexGrow: 1 }}>
        <Label>Allow Others to Edit</Label>
        <Flex my={1}>
          <Label>
            <Checkbox
              checked={!mapStateEmpty && mapState.editFlags.includes("fog")}
              disabled={mapStateEmpty}
              onChange={(e) => handleFlagChange(e, "fog")}
            />
            Fog
          </Label>
          <Label>
            <Checkbox
              checked={!mapStateEmpty && mapState.editFlags.includes("tokens")}
              disabled={mapStateEmpty}
              onChange={(e) => handleFlagChange(e, "tokens")}
            />
            Tokens
          </Label>
        </Flex>
      </Box>
    </Flex>
  );
}

export default MapSettings;
