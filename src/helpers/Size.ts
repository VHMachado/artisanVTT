import Vector2 from "./Vector2";

class Size extends Vector2 {
  private storedRadius?: number;

  constructor(width: number, height: number, radius?: number) {
    super(width, height);
    this.storedRadius = radius;
  }

  get width() { return this.x; }
  set width(value: number) { this.x = value; }

  get height() { return this.y; }
  set height(value: number) { this.y = value; }

  get radius() { return this.storedRadius || Math.min(this.width, this.height) / 2; }
  set radius(value: number) { this.storedRadius = value; }
}

export default Size;
