/**
 * A Game Master's camera, shared so players can follow along.
 *
 * The centre is stored in normalised map space (0-1 across the map image)
 * rather than screen pixels, and the zoom is relative to the map's on screen
 * size, so a follower reproduces the same view on a different sized window.
 */
export type CameraState = {
  /** Horizontal centre of the view, 0 is the left edge of the map, 1 the right */
  x: number;
  /** Vertical centre of the view, 0 is the top edge of the map, 1 the bottom */
  y: number;
  /** Stage scale, relative to the map fitting the stage at scale 1 */
  scale: number;
};
