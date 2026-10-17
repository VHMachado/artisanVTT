class Vector3 {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}

  static cubeRound(cube: Vector3): Vector3 {
    let x = Math.round(cube.x);
    let y = Math.round(cube.y);
    let z = Math.round(cube.z);

    const xDistance = Math.abs(x - cube.x);
    const yDistance = Math.abs(y - cube.y);
    const zDistance = Math.abs(z - cube.z);

    if (xDistance > yDistance && xDistance > zDistance) {
      x = -y - z;
    } else if (yDistance > zDistance) {
      y = -x - z;
    } else {
      z = -x - y;
    }

    return new Vector3(x, y, z);
  }
}

export default Vector3;
