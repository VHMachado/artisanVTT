import Vector2 from "./Vector2";

/**
 * Classical computer-vision grid detection.
 *
 * Replaces the trained CNN this project inherited, which never looked for a
 * line at all: it fed a 32x2048px strip to a network trained on ~1500 web maps
 * and snapped the resulting guess to an exact divisor of the image dimensions.
 * A map whose own grid is drawn into the texture was therefore read
 * statistically rather than geometrically, and a map not exported at an exact
 * multiple of its cell size could not even express the right answer.
 *
 * This reads a continuous drawn lattice or repeated floor tiles directly.
 *
 *  1. Matched line filter, at FULL resolution. A grid line is 1-2px wide, so
 *     any downscale convolves it away before it can be measured.
 *  2. Project along the line's own direction. A line that spans the image
 *     survives the average; uncorrelated texture does not.
 *  3. Comb statistic over candidate pitches, scored against the spread of the
 *     other pitches in the same band (median/MAD), so "how periodic is this"
 *     is answered on the image's own noise scale.
 *  4. Resolve the pitch-vs-multiple ambiguity structurally: if the MIDPOINTS
 *     between the candidate's lines are also lines, the real pitch is half.
 *     Amplitude alone cannot settle this - a comb at 2P lands every tooth on a
 *     line exactly like a comb at P - and getting it wrong is precisely the
 *     "suggested grid came out 2x per axis" failure of the old pipeline.
 *  5. Confirm by least-squares fit of line position against line index. A
 *     drawn grid fits to well under a pixel; periodic artwork does not fit.
 *
 * When no lattice is confirmed the detector says so instead of guessing, and
 * the caller keeps its own default. That is a deliberate behaviour change: a
 * map with no drawn grid has no grid to find, and inventing a confident number
 * for it is what made the old suggestion untrustworthy.
 */

/** Smallest cell size, in pixels, worth looking for */
const MIN_PITCH_PX = 8;
/** Grid must divide the image into at least this many cells */
const MIN_CELLS = 10;
/** ...and at most this many */
const MAX_CELLS = 200;
/**
 * Candidate pitches sampled across the band, logarithmically.
 *
 * This has to be fine enough that a comb hypothesis lands within a fraction of
 * a pixel of the true pitch somewhere in the scan. Too coarse and the peak is
 * simply missed: the scan then settles on whichever submultiple it did sample,
 * which is a silent off-by-2x rather than a visible failure.
 */
const PITCH_STEPS = 1200;
/** Phase search step, as a fraction of the pitch */
const PHASE_STEP = 0.05;
/** Robust z-score a pitch must reach before any lattice is claimed */
const MIN_Z = 7;
/**
 * Minimum line contrast, in luma units, for a lattice to be real.
 *
 * Without this an 8-bit quantisation staircase qualifies: a smooth gradient
 * steps by 1 LSB at perfectly regular intervals, which is genuinely periodic
 * and fits a straight line exactly. It is not a grid, and the only thing that
 * separates it from one is amplitude.
 */
const MIN_LINE_CONTRAST = 3;
/** Midpoints at least this strong (relative to the lines) mean the pitch halves */
const MIDPOINT_RATIO = 0.6;
/** Largest residual, in pixels, still counted as a straight line train */
const MAX_FIT_RMS = 1.5;
/** Minimum number of fitted lines for the fit to mean anything */
const MIN_FIT_LINES = 8;
/** A grid line must remain a narrow peak, not a broad smooth colour wave */
const MAX_LINE_WIDTH_RATIO = 0.18;
/** Width is measured at this fraction of the local line peak */
const LINE_PEAK_RATIO = 0.6;
/** Relative difference under which two axes are taken to agree */
const AXIS_AGREEMENT = 0.04;
/**
 * A tiled floor has lines only within rooms, so its energy repeats without
 * forming full-length lines. This is intentionally a separate, stricter
 * fallback from the drawn-lattice detector above.
 */
const TEXTURE_MIN_CORRELATION = 0.24;
const TEXTURE_TREND_RADIUS = 60;
/** A later autocorrelation harmonic cannot beat an almost-equally strong earlier peak */
const TEXTURE_HARMONIC_RATIO = 0.95;
/** A seam has to remain coherent for more than one cell along its own axis */
const MIN_TILE_SEAM_RUN_CELLS = 1.5;
/** Several independently located seams prevent one decorative edge from winning */
const MIN_TILE_SEAMS = 3;

export type GridDetection = {
  /** How the regular cell pitch was established */
  source: "lattice" | "floorTiles";
  /** Cell size in pixels of the detected lattice */
  pitch: number;
  /** Grid size in cells, derived from the image dimensions */
  size: Vector2;
  /** Phase of image-space grid lines, measured in pixels from the image origin */
  phase: Vector2;
  /** Robust z-score (lattice) or autocorrelation (floorTiles) */
  score: number;
  /** RMS residual of the line fit, present only for a drawn lattice */
  rms?: number;
  /** Number of fitted lines, present only for a drawn lattice */
  lines?: number;
};

type AxisResult = {
  pitch: number;
  phase: number;
  /** -1 for a dark line on a lighter map, +1 for a light line on a darker one */
  polarity: number;
  score: number;
  /** Mean line contrast in luma units, used to reject sub-threshold "lattices" */
  contrast: number;
};

/** ITU-R BT.601 luma of RGBA bytes, as a width x height plane */
function toLuma(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return out;
}

/**
 * Response to a thin line, projected along the line's own direction.
 *
 * Each sample is the centre pixel minus the mean of two flanks `d` away, so a
 * line of either polarity responds while broad shading cancels. Averaging down
 * the perpendicular axis is what separates a full-length line from texture.
 */
function lineProfile(
  luma: Float32Array,
  width: number,
  height: number,
  d: number,
  transposed: boolean
): Float64Array {
  // `across` indexes the axis the profile is over, `along` the line direction
  const across = transposed ? height : width;
  const along = transposed ? width : height;
  const profile = new Float64Array(across);
  for (let a = d; a < across - d; a++) {
    let sum = 0;
    for (let b = 0; b < along; b++) {
      const centre = transposed ? luma[a * width + b] : luma[b * width + a];
      const left = transposed ? luma[(a - d) * width + b] : luma[b * width + a - d];
      const right = transposed ? luma[(a + d) * width + b] : luma[b * width + a + d];
      sum += centre - 0.5 * (left + right);
    }
    profile[a] = sum / along;
  }
  return profile;
}

/**
 * Per-column/row line energy. Unlike `lineProfile`, this deliberately keeps
 * partial seams: a floor tile edge ends at walls and furniture, but it repeats
 * at the same pitch across many different rooms. The absolute response ignores
 * whether individual painted seams are light or dark.
 */
function tileEnergyProfile(
  luma: Float32Array,
  width: number,
  height: number,
  d: number,
  transposed: boolean
): Float64Array {
  const across = transposed ? height : width;
  const along = transposed ? width : height;
  const profile = new Float64Array(across);
  for (let a = d; a < across - d; a++) {
    let sum = 0;
    for (let b = 0; b < along; b++) {
      const centre = transposed ? luma[a * width + b] : luma[b * width + a];
      const left = transposed ? luma[(a - d) * width + b] : luma[b * width + a - d];
      const right = transposed ? luma[(a + d) * width + b] : luma[b * width + a + d];
      sum += Math.abs(centre - 0.5 * (left + right));
    }
    profile[a] = sum / along;
  }
  return profile;
}

/** Removes broad lighting/room-scale variation before texture autocorrelation */
function removeTrend(profile: Float64Array): Float64Array {
  const out = new Float64Array(profile.length);
  const prefix = new Float64Array(profile.length + 1);
  for (let i = 0; i < profile.length; i++) prefix[i + 1] = prefix[i] + profile[i];
  for (let i = 0; i < profile.length; i++) {
    const from = Math.max(0, i - TEXTURE_TREND_RADIUS);
    const to = Math.min(profile.length, i + TEXTURE_TREND_RADIUS + 1);
    out[i] = profile[i] - (prefix[to] - prefix[from]) / (to - from);
  }
  return out;
}

/** Normalized autocorrelation at an integer pixel lag */
function autocorrelation(profile: Float64Array, lag: number): number {
  let dot = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let i = 0; i + lag < profile.length; i++) {
    const left = profile[i];
    const right = profile[i + lag];
    dot += left * right;
    leftSquared += left * left;
    rightSquared += right * right;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator ? dot / denominator : 0;
}

/** Periodic floor-tile candidates on one axis, indexed by pitch in pixels */
function tileAutocorrelations(profile: Float64Array): Float64Array {
  const values = removeTrend(profile);
  const scores = new Float64Array(
    Math.floor(profile.length / MIN_CELLS) + 1
  );
  for (let pitch = MIN_PITCH_PX; pitch < scores.length; pitch++) {
    scores[pitch] = autocorrelation(values, pitch);
  }
  return scores;
}

function isAutocorrelationPeak(scores: Float64Array, pitch: number): boolean {
  if (pitch <= MIN_PITCH_PX || pitch >= scores.length) return false;
  // The image-relative maximum pitch can be the final valid index. It has no
  // right neighbour, so a strict left-side rise is the only meaningful peak
  // check at that boundary.
  return pitch + 1 === scores.length
    ? scores[pitch] > scores[pitch - 1]
    : scores[pitch] >= scores[pitch - 1] && scores[pitch] > scores[pitch + 1];
}

/**
 * Floor-tile pitch is the first strong periodic spacing. If a smaller local
 * autocorrelation peak is nearly as strong, a later peak is merely a harmonic
 * and must not become a larger invented cell after the smaller one fails a
 * seam-shape gate.
 */
function hasComparableSmallerAutocorrelationPeak(scores: Float64Array, pitch: number): boolean {
  for (let smaller = MIN_PITCH_PX + 1; smaller < pitch; smaller++) {
    if (
      isAutocorrelationPeak(scores, smaller) &&
      scores[smaller] >= scores[pitch] * TEXTURE_HARMONIC_RATIO
    ) {
      return true;
    }
  }
  return false;
}

/** Best integer phase for repeated high-energy seams at a proposed pitch */
function tilePhase(profile: Float64Array, pitch: number): { phase: number; energy: number } | null {
  let best: { phase: number; energy: number } | null = null;
  for (let phase = 0; phase < pitch; phase++) {
    let sum = 0;
    let count = 0;
    for (let x = phase; x < profile.length; x += pitch) {
      sum += profile[x];
      count++;
    }
    if (count < MIN_CELLS) continue;
    const energy = sum / count;
    if (best === null || energy > best.energy) best = { phase, energy };
  }
  return best;
}

/**
 * Counts the longest run of a single-polarity thin-line response along one
 * proposed seam. A smooth wallpaper can repeat in both directions, but its
 * curvature alternates sign every half-wave; a grout edge remains a coherent
 * light or dark stroke until a wall, furnishing, or perpendicular seam ends it.
 */
function seamRun(
  luma: Float32Array,
  width: number,
  height: number,
  d: number,
  transposed: boolean,
  across: number,
  threshold: number
): number {
  const along = transposed ? width : height;
  const acrossLength = transposed ? height : width;
  const responseAt = (a: number, b: number) => {
    const centre = transposed ? luma[a * width + b] : luma[b * width + a];
    const left = transposed ? luma[(a - d) * width + b] : luma[b * width + a - d];
    const right = transposed ? luma[(a + d) * width + b] : luma[b * width + a + d];
    return centre - 0.5 * (left + right);
  };
  let best = 0;
  let current = 0;
  let previousSign = 0;
  for (let b = 0; b < along; b++) {
    const response = responseAt(across, b);
    const narrow =
      (across - 1 >= d && Math.abs(responseAt(across - 1, b)) < Math.abs(response) * LINE_PEAK_RATIO) ||
      (across + 1 < acrossLength - d &&
        Math.abs(responseAt(across + 1, b)) < Math.abs(response) * LINE_PEAK_RATIO);
    const sign = narrow && response >= threshold ? 1 : narrow && response <= -threshold ? -1 : 0;
    if (sign !== 0 && sign === previousSign) {
      current++;
    } else if (sign !== 0) {
      current = 1;
    } else {
      current = 0;
    }
    previousSign = sign;
    best = Math.max(best, current);
  }
  return best;
}

/**
 * Requires repeated candidates to look like locally continuous seam strokes,
 * not merely like a 2-D periodic colour or lighting texture.
 */
function hasTileSeamSupport(
  luma: Float32Array,
  width: number,
  height: number,
  d: number,
  transposed: boolean,
  profile: Float64Array,
  pitch: number
): boolean {
  const phase = tilePhase(profile, pitch);
  if (!phase) {
    return false;
  }

  const threshold = Math.max(MIN_LINE_CONTRAST, phase.energy * 0.75);
  const minRun = Math.ceil(pitch * MIN_TILE_SEAM_RUN_CELLS);
  let seams = 0;
  for (let a = phase.phase; a < profile.length; a += pitch) {
    if (a < d || a >= profile.length - d) continue;
    if (seamRun(luma, width, height, d, transposed, a, threshold) >= minRun) {
      seams++;
      if (seams >= MIN_TILE_SEAMS) return true;
    }
  }
  return false;
}

/**
 * Some hand-painted maps use the same tile size in many rooms but place the
 * texture independently in each one. A global phase then cancels in a whole
 * image profile even though local grout geometry is clear. This pass keeps the
 * existing global detector as the first preference and only pools evidence
 * from independent image patches after that stricter proof has failed.
 */
const LOCAL_TILE_PATCH = 192;
const LOCAL_TILE_STRIDE = 96;
const LOCAL_TILE_MIN_CELLS = 4;
const LOCAL_TILE_MIN_CORRELATION = 0.18;
const LOCAL_TILE_MIN_VOTES = 3;
const LOCAL_TILE_QUORUM = 0.7;
/**
 * A local fallback may have no globally compatible phase. Keep its strongest
 * patch's anchor unless the full-image seam profile is materially stronger at
 * another phase; this corrects a local texture/lighting outlier without
 * averaging independently phased rooms into an arbitrary origin.
 */
const LOCAL_PHASE_GLOBAL_ADVANTAGE = 1.08;

type LocalTilePeak = { pitch: number; score: number };
type LocalTileVote = LocalTilePeak & { x: number; y: number; phase: number };

function localTileEnergyProfile(
  luma: Float32Array,
  width: number,
  x0: number,
  y0: number,
  size: number,
  d: number,
  transposed: boolean
): Float64Array {
  const profile = new Float64Array(size);
  for (let a = d; a < size - d; a++) {
    let sum = 0;
    for (let b = 0; b < size; b++) {
      const x = transposed ? x0 + b : x0 + a;
      const y = transposed ? y0 + a : y0 + b;
      const centre = luma[y * width + x];
      const left = transposed ? luma[(y - d) * width + x] : luma[y * width + x - d];
      const right = transposed ? luma[(y + d) * width + x] : luma[y * width + x + d];
      sum += Math.abs(centre - 0.5 * (left + right));
    }
    profile[a] = sum / size;
  }
  return profile;
}

function localTilePeaks(profile: Float64Array, maxPitch: number): LocalTilePeak[] {
  const values = removeTrend(profile);
  const scores = new Float64Array(maxPitch + 1);
  for (let pitch = MIN_PITCH_PX; pitch <= maxPitch; pitch++) {
    scores[pitch] = autocorrelation(values, pitch);
  }
  const peaks: LocalTilePeak[] = [];
  for (let pitch = MIN_PITCH_PX + 1; pitch <= maxPitch; pitch++) {
    if (
      scores[pitch] >= LOCAL_TILE_MIN_CORRELATION &&
      scores[pitch] >= scores[pitch - 1] &&
      (pitch === maxPitch || scores[pitch] > scores[pitch + 1])
    ) {
      peaks.push({ pitch, score: scores[pitch] });
    }
  }
  return peaks
    .filter(
      (peak) =>
        !peaks.some((smaller) => {
          if (smaller.pitch >= peak.pitch || smaller.score < peak.score * TEXTURE_HARMONIC_RATIO) {
            return false;
          }
          for (const divisor of [2, 3, 4, 6]) {
            if (Math.abs(peak.pitch - smaller.pitch * divisor) / peak.pitch <= AXIS_AGREEMENT) {
              return true;
            }
          }
          return false;
        })
    )
    .sort((a, b) => a.pitch - b.pitch)
    .slice(0, 4);
}

function localTilePhase(profile: Float64Array, pitch: number): { phase: number; energy: number } | null {
  let best: { phase: number; energy: number } | null = null;
  for (let phase = 0; phase < pitch; phase++) {
    let sum = 0;
    let count = 0;
    for (let x = phase; x < profile.length; x += pitch) {
      sum += profile[x];
      count++;
    }
    if (count < LOCAL_TILE_MIN_CELLS) continue;
    const energy = sum / count;
    if (best === null || energy > best.energy) best = { phase, energy };
  }
  return best;
}

function localSeamRun(
  luma: Float32Array,
  width: number,
  x0: number,
  y0: number,
  size: number,
  d: number,
  transposed: boolean,
  across: number,
  threshold: number
): number {
  const responseAt = (a: number, b: number) => {
    const x = transposed ? x0 + b : x0 + a;
    const y = transposed ? y0 + a : y0 + b;
    const centre = luma[y * width + x];
    const left = transposed ? luma[(y - d) * width + x] : luma[y * width + x - d];
    const right = transposed ? luma[(y + d) * width + x] : luma[y * width + x + d];
    return centre - 0.5 * (left + right);
  };
  let best = 0;
  let current = 0;
  let previousSign = 0;
  for (let b = 0; b < size; b++) {
    const response = responseAt(across, b);
    const narrow =
      (across - 1 >= d && Math.abs(responseAt(across - 1, b)) < Math.abs(response) * LINE_PEAK_RATIO) ||
      (across + 1 < size - d &&
        Math.abs(responseAt(across + 1, b)) < Math.abs(response) * LINE_PEAK_RATIO);
    const sign = narrow && response >= threshold ? 1 : narrow && response <= -threshold ? -1 : 0;
    current = sign !== 0 && sign === previousSign ? current + 1 : sign !== 0 ? 1 : 0;
    previousSign = sign;
    best = Math.max(best, current);
  }
  return best;
}

function hasLocalTileSeamSupport(
  luma: Float32Array,
  width: number,
  x0: number,
  y0: number,
  size: number,
  d: number,
  transposed: boolean,
  profile: Float64Array,
  pitch: number
): boolean {
  const phase = localTilePhase(profile, pitch);
  if (!phase) return false;

  const threshold = Math.max(MIN_LINE_CONTRAST, phase.energy * 0.65);
  const minRun = Math.ceil(pitch * 0.75);
  let seams = 0;
  for (let a = phase.phase; a < size; a += pitch) {
    if (a < d || a >= size - d) continue;
    if (
      localSeamRun(luma, width, x0, y0, size, d, transposed, a, threshold) >= minRun &&
      ++seams >= 2
    ) {
      return true;
    }
  }
  return false;
}

function localTileVotes(
  luma: Float32Array,
  width: number,
  height: number,
  d: number,
  transposed: boolean
): LocalTileVote[] {
  const votes: LocalTileVote[] = [];
  const maxPitch = Math.min(
    Math.floor(LOCAL_TILE_PATCH / LOCAL_TILE_MIN_CELLS),
    Math.floor((transposed ? height : width) / MIN_CELLS)
  );
  if (maxPitch <= MIN_PITCH_PX) return votes;

  for (let y = 0; y + LOCAL_TILE_PATCH <= height; y += LOCAL_TILE_STRIDE) {
    for (let x = 0; x + LOCAL_TILE_PATCH <= width; x += LOCAL_TILE_STRIDE) {
      const profile = localTileEnergyProfile(luma, width, x, y, LOCAL_TILE_PATCH, d, transposed);
      for (const peak of localTilePeaks(profile, maxPitch)) {
        const phase = localTilePhase(profile, peak.pitch);
        if (
          phase &&
          hasLocalTileSeamSupport(
            luma,
            width,
            x,
            y,
            LOCAL_TILE_PATCH,
            d,
            transposed,
            profile,
            peak.pitch
          )
        ) {
          votes.push({ ...peak, x, y, phase: (transposed ? y : x) + phase.phase });
        }
      }
    }
  }
  return votes;
}

type LocalTilePair = {
  x: number;
  y: number;
  score: number;
  phaseX: number;
  phaseY: number;
};

/**
 * Local floor rooms may deliberately use incompatible texture phases. A VTT
 * has one global origin, so anchor it to the strongest spatially independent
 * square-tile patch rather than averaging unrelated rooms into a phase that
 * matches none of them.
 */
function strongestLocalPhase(
  pairs: LocalTilePair[],
  pitch: number,
  axis: "x" | "y"
): number {
  const strongest = pairs[0];
  const phase = axis === "x" ? strongest.phaseX : strongest.phaseY;
  return ((phase % pitch) + pitch) % pitch;
}

/** Mean full-image seam energy at one phase of a known pitch */
function tilePhaseEnergy(profile: Float64Array, pitch: number, phase: number): number | null {
  let sum = 0;
  let count = 0;
  for (let x = phase; x < profile.length; x += pitch) {
    sum += profile[x];
    count++;
  }
  return count >= MIN_CELLS ? sum / count : null;
}

/**
 * Selects a local phase anchor, replacing it only with materially stronger
 * full-image seam evidence. Exported so the threshold stays regression-tested.
 */
export function chooseLocalPhase(
  anchor: number,
  anchorEnergy: number | null,
  global: { phase: number; energy: number } | null
): number {
  if (
    global &&
    anchorEnergy !== null &&
    global.energy >= anchorEnergy * LOCAL_PHASE_GLOBAL_ADVANTAGE
  ) {
    return global.phase;
  }
  return anchor;
}

/**
 * Keep the strongest independently confirmed local anchor by default. If the
 * whole image has notably stronger seam energy at another phase, use it: this
 * protects a global floor alignment from one locally noisy patch while leaving
 * genuinely rephased rooms anchored to real local geometry.
 */
function refineLocalPhase(
  pairs: LocalTilePair[],
  pitch: number,
  axis: "x" | "y",
  globalProfile: Float64Array
): number {
  const anchor = strongestLocalPhase(pairs, pitch, axis);
  const global = tilePhase(globalProfile, pitch);
  return chooseLocalPhase(anchor, tilePhaseEnergy(globalProfile, pitch, anchor), global);
}

function independentLocalTilePairs(pairs: LocalTilePair[]): LocalTilePair[] {
  const independent: LocalTilePair[] = [];
  for (const pair of [...pairs].sort((a, b) => b.score - a.score)) {
    // The scan overlaps by 50%. Count only disjoint patches that independently
    // contain both orientations, so separate stripe decorations cannot combine
    // into an invented square grid.
    const overlaps = independent.some(
      (other) =>
        Math.abs(other.x - pair.x) < LOCAL_TILE_PATCH &&
        Math.abs(other.y - pair.y) < LOCAL_TILE_PATCH
    );
    if (!overlaps) independent.push(pair);
  }
  return independent;
}

function detectLocallyTiledFloor(
  luma: Float32Array,
  width: number,
  height: number,
  d: number
): GridDetection | null {
  const xVotes = localTileVotes(luma, width, height, d, false);
  const yVotes = localTileVotes(luma, width, height, d, true);
  const candidates: {
    x: number;
    y: number;
    pitch: number;
    votes: number;
    score: number;
    pairs: LocalTilePair[];
  }[] = [];

  for (let x = MIN_PITCH_PX; x <= Math.floor(width / MIN_CELLS); x++) {
    const xMatches = xVotes.filter((vote) => vote.pitch === x);
    if (!xMatches.length) continue;
    for (let y = MIN_PITCH_PX; y <= Math.floor(height / MIN_CELLS); y++) {
      if (Math.abs(x - y) / Math.max(x, y) > AXIS_AGREEMENT) continue;
      const yMatches = yVotes.filter((vote) => vote.pitch === y);
      if (!yMatches.length) continue;
      const paired = independentLocalTilePairs(
        xMatches.flatMap((xVote) =>
          yMatches
            .filter((yVote) => yVote.x === xVote.x && yVote.y === xVote.y)
            .map((yVote) => ({
              x: xVote.x,
              y: xVote.y,
              score: Math.min(xVote.score, yVote.score),
              phaseX: xVote.phase,
              phaseY: yVote.phase,
            }))
        )
      );
      if (!paired.length) continue;
      const votes = paired.length;
      const score = paired.reduce((sum, pair) => sum + pair.score, 0) / paired.length;
      if (score >= TEXTURE_MIN_CORRELATION) {
        candidates.push({ x, y, pitch: (x + y) / 2, votes, score, pairs: paired });
      }
    }
  }
  if (!candidates.length) return null;
  const maximumVotes = Math.max(...candidates.map((candidate) => candidate.votes));
  const best = candidates
    .filter(
      (candidate) =>
        candidate.votes >= LOCAL_TILE_MIN_VOTES &&
        candidate.votes >= Math.ceil(maximumVotes * LOCAL_TILE_QUORUM)
    )
    .sort((a, b) => a.pitch - b.pitch || b.score - a.score)[0];
  if (!best) return null;

  const xProfile = tileEnergyProfile(luma, width, height, d, false);
  const yProfile = tileEnergyProfile(luma, width, height, d, true);
  return {
    source: "floorTiles",
    pitch: best.pitch,
    size: {
      x: Math.max(1, Math.round(width / best.pitch)),
      y: Math.max(1, Math.round(height / best.pitch)),
    },
    phase: {
      x: refineLocalPhase(best.pairs, best.x, "x", xProfile),
      y: refineLocalPhase(best.pairs, best.y, "y", yProfile),
    },
    score: best.score,
  };
}

/** First and last index of the profile's valid (filtered) region */
function validRange(profile: Float64Array): [number, number] {
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < profile.length && profile[lo] === 0) lo++;
  while (hi > lo && profile[hi] === 0) hi--;
  return [lo, hi];
}

/** Linear interpolation of the profile at a fractional index */
function sampleAt(profile: Float64Array, x: number): number {
  const i = Math.floor(x);
  const t = x - i;
  return profile[i] * (1 - t) + profile[i + 1] * t;
}

/**
 * Mean of the profile sampled every `pitch` pixels from `phase`, signed so a
 * dark line train scores positively when `polarity` is -1.
 */
function combAt(
  profile: Float64Array,
  lo: number,
  hi: number,
  pitch: number,
  phase: number,
  polarity: number
): number | null {
  let sum = 0;
  let count = 0;
  for (let x = lo + phase; x <= hi - 1; x += pitch) {
    sum += sampleAt(profile, x) * polarity;
    count++;
  }
  return count >= MIN_CELLS ? sum / count : null;
}

/** The best comb over all phases, and the phase that achieved it */
function bestComb(
  profile: Float64Array,
  lo: number,
  hi: number,
  pitch: number,
  polarity: number
): { value: number; phase: number } | null {
  let best: { value: number; phase: number } | null = null;
  const step = Math.max(0.25, pitch * PHASE_STEP);
  for (let phase = 0; phase < pitch; phase += step) {
    const value = combAt(profile, lo, hi, pitch, phase, polarity);
    if (value !== null && (best === null || value > best.value)) {
      best = { value, phase };
    }
  }
  return best;
}

/** Median of a copy of `values` (does not mutate the input) */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation, scaled to be comparable to a standard deviation */
function mad(values: number[], centre: number): number {
  const deviations = values.map((v) => Math.abs(v - centre));
  return 1.4826 * median(deviations);
}

/**
 * Reduces a pitch to its fundamental by testing for lines in between.
 *
 * This is the whole defence against reporting a multiple of the real cell size,
 * the failure the replaced pipeline shipped. It is a structural question - are
 * there lines at p/2, or at p/3? - so it is immune to the amplitude tie that
 * makes a comb at P and one at 2P score alike (both land every tooth on a
 * line, so neither can win on strength).
 *
 * Interior points are judged against the OTHER interior points at the same
 * division, not against zero: the profile is a local-contrast response, so the
 * area between lines is not flat, and an absolute floor would halve the pitch
 * of a perfectly good lattice. Divisor 3 is tested as well as 2 because a map
 * with emphasised every-third-cell lines otherwise reports 3x the true size.
 */
function reduceToFundamental(
  profile: Float64Array,
  lo: number,
  hi: number,
  pitch: number,
  phase: number,
  polarity: number,
  minPitch: number
): number {
  let current = pitch;
  // Repeat so that e.g. a 6x overshoot reduces through 3x then 2x.
  for (let round = 0; round < 4; round++) {
    let reduced = false;
    for (const divisor of [2, 3]) {
      const candidate = current / divisor;
      if (candidate < minPitch) continue;

      const onLine = combAt(profile, lo, hi, current, phase, polarity);
      if (onLine === null) continue;

      // The points this division would newly turn into lines...
      let interior = Infinity;
      for (let k = 1; k < divisor; k++) {
        const value = combAt(profile, lo, hi, current, phase + k * candidate, polarity);
        if (value === null) {
          interior = Infinity;
          break;
        }
        interior = Math.min(interior, value);
      }
      if (!Number.isFinite(interior)) continue;

      // ...measured against a point that stays between lines either way.
      const reference = combAt(
        profile,
        lo,
        hi,
        current,
        phase + candidate / 2,
        polarity
      );
      if (reference === null) continue;

      const range = onLine - reference;
      if (range <= 0) continue;
      if ((interior - reference) / range >= MIDPOINT_RATIO) {
        current = candidate;
        reduced = true;
        break;
      }
    }
    if (!reduced) break;
  }
  return current;
}

/** Strongest periodic line train along one axis, or null if there is none */
function detectAxis(profile: Float64Array): AxisResult | null {
  const [lo, hi] = validRange(profile);
  const span = hi - lo;
  if (span < 64) return null;

  const minPitch = Math.max(MIN_PITCH_PX, span / MAX_CELLS);
  const maxPitch = span / MIN_CELLS;
  if (maxPitch <= minPitch) return null;

  let best: AxisResult | null = null;
  for (const polarity of [-1, 1]) {
    const values: number[] = [];
    const pitches: number[] = [];
    const phases: number[] = [];
    for (let i = 0; i < PITCH_STEPS; i++) {
      const pitch = Math.exp(
        Math.log(minPitch) + ((Math.log(maxPitch) - Math.log(minPitch)) * i) / (PITCH_STEPS - 1)
      );
      const comb = bestComb(profile, lo, hi, pitch, polarity);
      if (comb) {
        values.push(comb.value);
        pitches.push(pitch);
        phases.push(comb.phase);
      }
    }
    if (values.length < 20) continue;

    const centre = median(values);
    const spread = mad(values, centre) || Number.EPSILON;

    let peak = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[peak]) peak = i;
    }

    // Refine the pitch on a fine linear grid around the winner
    let pitch = pitches[peak];
    let phase = phases[peak];
    let value = values[peak];
    for (let i = 0; i <= 32; i++) {
      const candidate = pitch * (0.96 + (0.08 * i) / 32);
      const comb = bestComb(profile, lo, hi, candidate, polarity);
      if (comb && comb.value > value) {
        value = comb.value;
        pitch = candidate;
        phase = comb.phase;
      }
    }

    const score = (value - centre) / spread;
    pitch = reduceToFundamental(profile, lo, hi, pitch, phase, polarity, minPitch);
    // Re-lock the phase at the (possibly halved) final pitch
    const relocked = bestComb(profile, lo, hi, pitch, polarity);
    if (!relocked) continue;

    if (best === null || score > best.score) {
      best = {
        pitch,
        phase: relocked.phase + lo,
        polarity,
        score,
        contrast: relocked.value,
      };
    }
  }
  return best;
}

/**
 * Least-squares fit of each line's measured position against its index.
 *
 * A periodicity score says "something repeats at this spacing"; this says
 * "and the repeats lie on a straight arithmetic progression", which is what
 * distinguishes a drawn lattice from periodic artwork. Returns the refined
 * pitch and the fit's RMS residual in pixels.
 */
function fitLines(
  profile: Float64Array,
  axis: AxisResult
): { pitch: number; phase: number; rms: number; lines: number } | null {
  const window = Math.max(2, Math.round(axis.pitch * 0.18));
  const indices: number[] = [];
  const positions: number[] = [];

  for (let k = 0; ; k++) {
    const centre = axis.phase + k * axis.pitch;
    if (centre > profile.length - 2) break;
    const from = Math.max(0, Math.round(centre - window));
    const to = Math.min(profile.length - 1, Math.round(centre + window));
    if (to - from < 2) continue;
    // snap to the strongest response of the right polarity nearby
    let bestAt = from;
    let bestValue = profile[from] * axis.polarity;
    for (let x = from + 1; x <= to; x++) {
      const value = profile[x] * axis.polarity;
      if (value > bestValue) {
        bestValue = value;
        bestAt = x;
      }
    }
    if (bestValue > 0) {
      indices.push(k);
      positions.push(bestAt);
    }
  }
  if (positions.length < MIN_FIT_LINES) return null;

  const n = positions.length;
  let sumK = 0;
  let sumP = 0;
  let sumKK = 0;
  let sumKP = 0;
  for (let i = 0; i < n; i++) {
    sumK += indices[i];
    sumP += positions[i];
    sumKK += indices[i] * indices[i];
    sumKP += indices[i] * positions[i];
  }
  const denominator = n * sumKK - sumK * sumK;
  if (denominator === 0) return null;
  const slope = (n * sumKP - sumK * sumP) / denominator;
  const intercept = (sumP - slope * sumK) / n;
  if (!(slope > 0)) return null;

  let squared = 0;
  for (let i = 0; i < n; i++) {
    const residual = positions[i] - (slope * indices[i] + intercept);
    squared += residual * residual;
  }
  return {
    pitch: slope,
    phase: ((intercept % slope) + slope) % slope,
    rms: Math.sqrt(squared / n),
    lines: n,
  };
}

/**
 * A periodic gradient can fit an arithmetic progression with zero residual,
 * so fitting alone cannot establish that the repetitions are grid *lines*.
 * Count the width of each fitted peak at 60% of its local maximum: a 1-2px
 * stroke remains narrow, while a sinusoidal ridge stays high for much of a
 * cell. Most fitted peaks must satisfy the narrow-stroke constraint.
 */
function hasNarrowLinePeaks(profile: Float64Array, axis: AxisResult): boolean {
  const searchWindow = Math.max(2, Math.round(axis.pitch * MAX_LINE_WIDTH_RATIO));
  const maxWidth = Math.max(2, Math.ceil(axis.pitch * MAX_LINE_WIDTH_RATIO));
  let measured = 0;
  let narrow = 0;

  for (let k = 0; ; k++) {
    const centre = axis.phase + k * axis.pitch;
    if (centre > profile.length - 2) break;
    const from = Math.max(0, Math.round(centre - searchWindow));
    const to = Math.min(profile.length - 1, Math.round(centre + searchWindow));
    let peakAt = from;
    let peak = profile[from] * axis.polarity;
    for (let x = from + 1; x <= to; x++) {
      const value = profile[x] * axis.polarity;
      if (value > peak) {
        peak = value;
        peakAt = x;
      }
    }
    if (peak <= 0) continue;
    measured++;

    let left = peakAt;
    while (left > 0 && profile[left - 1] * axis.polarity >= peak * LINE_PEAK_RATIO) left--;
    let right = peakAt;
    while (
      right + 1 < profile.length &&
      profile[right + 1] * axis.polarity >= peak * LINE_PEAK_RATIO
    ) {
      right++;
    }
    if (right - left + 1 <= maxWidth) narrow++;
  }
  return measured >= MIN_FIT_LINES && narrow / measured >= 0.75;
}

/**
 * Finds a repeated square floor-tile pitch after the stricter full-line
 * lattice detector declines. Tile seams can end at walls and furniture, so
 * fitting a line across the whole image would reject the exact pattern a GM
 * wants to use as a cell. Autocorrelation measures their repeated spacing
 * instead; agreement on both axes still prevents a one-dimensional texture
 * from becoming a grid.
 */
function detectFloorTiles(
  luma: Float32Array,
  width: number,
  height: number,
  flank: number,
  allowLocal = true
): GridDetection | null {
  const xProfile = tileEnergyProfile(luma, width, height, flank, false);
  const yProfile = tileEnergyProfile(luma, width, height, flank, true);
  const xScores = tileAutocorrelations(xProfile);
  const yScores = tileAutocorrelations(yProfile);
  const xSupport = new Map<number, boolean>();
  const ySupport = new Map<number, boolean>();
  let best: { x: number; y: number; score: number } | null = null;

  for (let x = MIN_PITCH_PX; x < xScores.length; x++) {
    if (xScores[x] < TEXTURE_MIN_CORRELATION || !isAutocorrelationPeak(xScores, x)) continue;
    if (hasComparableSmallerAutocorrelationPeak(xScores, x)) continue;
    for (let y = MIN_PITCH_PX; y < yScores.length; y++) {
      if (yScores[y] < TEXTURE_MIN_CORRELATION || !isAutocorrelationPeak(yScores, y)) continue;
      if (hasComparableSmallerAutocorrelationPeak(yScores, y)) continue;
      if (Math.abs(x - y) / Math.max(x, y) > AXIS_AGREEMENT) continue;
      if (!xSupport.has(x)) {
        xSupport.set(x, hasTileSeamSupport(luma, width, height, flank, false, xProfile, x));
      }
      if (!xSupport.get(x)) continue;
      if (!ySupport.has(y)) {
        ySupport.set(y, hasTileSeamSupport(luma, width, height, flank, true, yProfile, y));
      }
      if (!ySupport.get(y)) continue;

      const score = Math.min(xScores[x], yScores[y]);
      if (
        best === null ||
        (x + y) / 2 < (best.x + best.y) / 2 ||
        ((x + y) / 2 === (best.x + best.y) / 2 && score > best.score)
      ) {
        best = { x, y, score };
      }
    }
  }
  if (!best) return allowLocal ? detectLocallyTiledFloor(luma, width, height, flank) : null;

  const pitch = (best.x + best.y) / 2;
  const xPhase = tilePhase(xProfile, best.x);
  const yPhase = tilePhase(yProfile, best.y);
  if (!xPhase || !yPhase) return allowLocal ? detectLocallyTiledFloor(luma, width, height, flank) : null;
  return {
    source: "floorTiles",
    pitch,
    size: {
      x: Math.max(1, Math.round(width / pitch)),
      y: Math.max(1, Math.round(height / pitch)),
    },
    phase: { x: xPhase.phase, y: yPhase.phase },
    score: best.score,
  };
}

/**
 * Finds the grid drawn into a map image, or null when there is none to find.
 *
 * Returning null is a real answer, not a failure: plenty of battle maps have no
 * lattice in their pixels, and the caller should keep its own default rather
 * than be handed a confident guess.
 */
export function detectGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number
): GridDetection | null {
  if (width < 64 || height < 64) return null;

  const luma = toLuma(data, width, height);
  // Flank distance: half the smallest cell we are willing to find, so the
  // filter straddles a line without reaching into the neighbouring one.
  const flank = Math.max(2, Math.round(Math.min(width, height) / MAX_CELLS / 2));

  const horizontal = lineProfile(luma, width, height, flank, false);
  const vertical = lineProfile(luma, width, height, flank, true);
  const alongX = detectAxis(horizontal);
  const alongY = detectAxis(vertical);

  const candidates: { axis: AxisResult; profile: Float64Array }[] = [];
  for (const [axis, profile] of [
    [alongX, horizontal],
    [alongY, vertical],
  ] as const) {
    if (axis && axis.score >= MIN_Z && axis.contrast >= MIN_LINE_CONTRAST) {
      candidates.push({ axis, profile });
    }
  }

  // A square grid is a 2-D lattice, not merely one repeating line train.
  // Requiring both orientations prevents striped artwork, floorboards, window
  // panes, and ruled paper from overriding the caller's default grid size.
  if (candidates.length !== 2) return detectFloorTiles(luma, width, height, flank);

  const fitted = candidates.map(({ axis, profile }) => {
    const fit = fitLines(profile, axis);
    return fit && fit.rms <= MAX_FIT_RMS && hasNarrowLinePeaks(profile, axis)
      ? { axis, fit }
      : null;
  });
  if (fitted[0] === null || fitted[1] === null) {
    return detectFloorTiles(luma, width, height, flank, false);
  }

  const [a, b] = fitted;
  if (Math.abs(a.fit.pitch - b.fit.pitch) / Math.max(a.fit.pitch, b.fit.pitch) > AXIS_AGREEMENT) {
    return detectFloorTiles(luma, width, height, flank, false);
  }

  // Both axes independently confirm the same cell pitch. Weight the final
  // estimate by their robust periodicity scores, while reporting the weaker
  // axis's evidence so callers never receive a stronger confidence than the
  // complete 2-D lattice earned.
  const totalScore = a.axis.score + b.axis.score;
  const pitch =
    (a.fit.pitch * a.axis.score + b.fit.pitch * b.axis.score) / totalScore;
  const size = {
    x: Math.max(1, Math.round(width / pitch)),
    y: Math.max(1, Math.round(height / pitch)),
  };
  return {
    source: "lattice",
    pitch,
    size,
    phase: { x: a.fit.phase, y: b.fit.phase },
    score: Math.min(a.axis.score, b.axis.score),
    rms: Math.max(a.fit.rms, b.fit.rms),
    lines: Math.min(a.fit.lines, b.fit.lines),
  };
}

export default detectGrid;
