type Dictionary = Record<PropertyKey, any>;

export function omit(object: Dictionary, omittedKeys: string[]): Dictionary {
  return Object.entries(object).reduce<Dictionary>((result, [key, value]) => {
    if (!omittedKeys.includes(key)) {
      result[key] = value;
    }
    return result;
  }, {});
}

export function fromEntries(entries: Iterable<[string | number, any]>) {
  if (Object.fromEntries) {
    return Object.fromEntries(entries);
  }

  const result: Record<string | number, any> = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

export function isStreamStopped(stream: MediaStream): boolean {
  return stream.getTracks().reduce((allMuted, track) => allMuted && track, { muted: true })
    .muted;
}

export const roundTo = (value: number, increment: number): number =>
  Math.round(value / increment) * increment;

export const floorTo = (value: number, increment: number): number =>
  Math.floor(value / increment) * increment;

export const toRadians = (degrees: number): number => degrees * (Math.PI / 180);
export const toDegrees = (radians: number): number => radians * (180 / Math.PI);
export const lerp = (from: number, to: number, amount: number): number =>
  from * (1 - amount) + to * amount;

export function logImage(url: string, width: number, height: number): void {
  console.log(
    "%c ",
    [
      "font-size: 1px;",
      `padding: ${height}px ${width}px;`,
      `background: url(${url}) no-repeat;`,
      "background-size: contain;",
    ].join(" ")
  );
}

export function isEmpty(object: Object): boolean {
  return Object.keys(object).length === 0 && object.constructor === Object;
}

export function keyBy<Type extends Dictionary>(items: Type[], key: string): Record<string, Type> {
  return items.reduce<Record<string, Type>>((result, item) => {
    result[key ? item[key] : item] = item;
    return result;
  }, {});
}

export function groupBy(items: Dictionary[], key: string): Record<string, any[]> {
  return items.reduce<Record<string, any[]>>((groups, item) => {
    const group = item[key];
    (groups[group] || (groups[group] = [])).push(item);
    return groups;
  }, {});
}

export const isMacLike = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
export const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function shuffle<Type>(items: Type[]): Type[] {
  const shuffled = [...items];
  for (let end = shuffled.length; end !== 0; end -= 1) {
    const index = Math.floor(Math.random() * end);
    [shuffled[end - 1], shuffled[index]] = [shuffled[index], shuffled[end - 1]];
  }
  return shuffled;
}

export async function clipboardSupported(): Promise<boolean> {
  // @ts-ignore
  if (!navigator.clipboard?.readText || !navigator.clipboard?.writeText || !navigator.permissions) {
    return false;
  }

  // @ts-ignore
  let permission = await navigator.permissions.query({ name: "clipboard-read" });
  if (permission.state === "prompt") {
    try {
      await navigator.clipboard.readText();
      // @ts-ignore
      permission = await navigator.permissions.query({ name: "clipboard-read" });
      await timeout(300);
    } catch {
      return false;
    }
  }
  return permission.state === "granted";
}

export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
