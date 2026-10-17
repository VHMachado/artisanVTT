#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_MAX_RATIO = 0.4;
const DEFAULT_MAX_RUN = 12;

function parseArgs(args) {
  const options = { paths: [], maxRatio: DEFAULT_MAX_RATIO, maxRun: DEFAULT_MAX_RUN };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--reference") options.reference = args[++index];
    else if (value === "--max-ratio") options.maxRatio = Number(args[++index]);
    else if (value === "--max-run") options.maxRun = Number(args[++index]);
    else if (value === "--diag") options.diagnostics = true;
    else if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    else options.paths.push(value);
  }
  if (!options.reference) throw new Error("Missing --reference <bare-repository>");
  if (options.paths.length === 0) throw new Error("Provide at least one working-tree path");
  if (!Number.isFinite(options.maxRatio) || !Number.isFinite(options.maxRun)) {
    throw new Error("Similarity limits must be numeric");
  }
  return options;
}

function runGit(reference, path) {
  const result = spawnSync("git", ["-C", reference, "show", `upstream-main:${path}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.replace(/\r\n/g, "\n").split("\n") : null;
}

function matchingBlocks(left, right) {
  function longestMatch(leftStart, leftEnd, rightStart, rightEnd) {
    let endings = new Map();
    let best = { left: leftStart, right: rightStart, size: 0 };
    for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
      const nextEndings = new Map();
      for (let rightIndex = rightStart; rightIndex < rightEnd; rightIndex += 1) {
        if (left[leftIndex] !== right[rightIndex]) continue;
        const size = (endings.get(rightIndex - 1) || 0) + 1;
        nextEndings.set(rightIndex, size);
        if (size > best.size) best = { left: leftIndex - size + 1, right: rightIndex - size + 1, size };
      }
      endings = nextEndings;
    }
    return best;
  }

  const pending = [[0, left.length, 0, right.length]];
  const blocks = [];
  while (pending.length) {
    const [leftStart, leftEnd, rightStart, rightEnd] = pending.pop();
    if (leftStart >= leftEnd || rightStart >= rightEnd) continue;
    const match = longestMatch(leftStart, leftEnd, rightStart, rightEnd);
    if (match.size === 0) continue;
    blocks.push(match);
    if (match.left > leftStart && match.right > rightStart) pending.push([leftStart, match.left, rightStart, match.right]);
    if (match.left + match.size < leftEnd && match.right + match.size < rightEnd) {
      pending.push([match.left + match.size, leftEnd, match.right + match.size, rightEnd]);
    }
  }
  return blocks.sort((first, second) => first.left - second.left || first.right - second.right);
}

function measure(upstream, candidate) {
  const blocks = matchingBlocks(upstream, candidate);
  const matched = blocks.reduce((total, block) => total + block.size, 0);
  const denominator = upstream.length + candidate.length;
  return {
    blocks,
    ratio: denominator === 0 ? 1 : (2 * matched) / denominator,
    longestRun: blocks.reduce((largest, block) => Math.max(largest, block.size), 0),
  };
}

function readCandidate(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").split("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let failed = false;
  for (const path of options.paths) {
    const candidate = readCandidate(path);
    if (!candidate) {
      console.log(`${path}: MISSING FROM WORKING TREE`);
      continue;
    }
    const upstream = runGit(options.reference, path);
    if (!upstream) {
      console.log(`${path}: NO UPSTREAM MATCH`);
      continue;
    }
    const result = measure(upstream, candidate);
    const passes = result.ratio < options.maxRatio && result.longestRun < options.maxRun;
    console.log(`${path}: ratio=${result.ratio.toFixed(3)} run=${result.longestRun} ${passes ? "PASS" : "FAIL"}`);
    if (options.diagnostics) {
      for (const block of result.blocks.filter((block) => block.size >= 3)) {
        console.log(`  size=${block.size} upstream[${block.left}]=${JSON.stringify(upstream[block.left])}`);
      }
    }
    failed ||= !passes;
  }
  process.exitCode = failed ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
