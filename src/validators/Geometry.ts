export const GeometrySchema = {
  definitions: {
    RectData: {
      properties: {
        height: { type: "number" }, width: { type: "number" },
        y: { type: "number" }, x: { type: "number" },
      },
      required: ["height", "width", "y", "x"],
      type: "object",
    },
    PointsData: {
      properties: {
        points: { items: { $ref: "urn:artisan:schema:vector2" }, type: "array" },
      },
      required: ["points"],
      type: "object",
    },
  },
  $id: "urn:artisan:schema:geometry",
};
