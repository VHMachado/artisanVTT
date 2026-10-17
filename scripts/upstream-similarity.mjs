#!/usr/bin/env node

/**
 * Measure how much of the current tree is still textually the upstream tree.
 * 
 * Compares HEAD against upstream/main for every path present in both, using
 * difflib over lines. Writes a CSV and prints a summary.
 */

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Text file extensions that we compare
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html",
  ".md", ".yml", ".yaml", ".go", ".mod", ".sum", ".svg", ".txt"
]);

/**
 * A line-based longest common subsequence algorithm that mimics Python's difflib.SequenceMatcher.
 * Returns the ratio and matching blocks.
 */
function sequenceMatcher(a, b) {
  // Implementation based on difflib's approach: find longest contiguous matches recursively
  function longestMatch(a, alo, ahi, b, blo, bhi) {
    // Map of ending index j in b -> length of match ending at (i-1, j-1)
    let j2len = new Map();
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    
    for (let i = alo; i < ahi; i++) {
      const new_j2len = new Map();
      const j2len_prev = j2len;
      
      for (let j = blo; j < bhi; j++) {
        if (a[i] === b[j]) {
          const k = (j2len_prev.get(j - 1) || 0) + 1;
          new_j2len.set(j, k);
          
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      
      j2len = new_j2len;
    }
    
    return { besti, bestj, bestsize };
  }
  
  function getMatchingBlocks(a, b) {
    const blocks = [];
    const stack = [[0, a.length, 0, b.length]];
    
    while (stack.length > 0) {
      const [alo, ahi, blo, bhi] = stack.pop();
      
      if (alo >= ahi || blo >= bhi) {
        continue;
      }
      
      const { besti, bestj, bestsize } = longestMatch(a, alo, ahi, b, blo, bhi);
      
      if (bestsize > 0) {
        blocks.push({ a: besti, b: bestj, size: bestsize });
        
        // Push the two sub-ranges
        if (besti > alo && bestj > blo) {
          stack.push([alo, besti, blo, bestj]);
        }
        if (besti + bestsize < ahi && bestj + bestsize < bhi) {
          stack.push([besti + bestsize, ahi, bestj + bestsize, bhi]);
        }
      }
      // bestsize === 0 means a[alo:ahi] and b[blo:bhi] share no line at
      // all -- there is nothing left to recurse on, so this range simply
      // contributes no block. (A previous version of this branch pushed
      // the SAME unchanged [alo, ahi, blo, bhi] back onto the stack here,
      // which never shrinks the range and spins forever recomputing the
      // same O(n*m) scan -- confirmed as an actual hang against this
      // repo's real files, e.g. src/upgrade.ts, >60s of 100% CPU with no
      // output. Do not reintroduce a fallback push in this branch.)
    }
    
    // Sort by a and then b
    blocks.sort((x, y) => {
      if (x.a !== y.a) return x.a - y.a;
      return x.b - y.b;
    });
    
    return blocks;
  }
  
  // Get matching blocks
  const blocks = getMatchingBlocks(a, b);
  
  // Calculate ratio: 2 * M / T where M = total matched chars, T = total chars
  const totalMatched = blocks.reduce((sum, block) => sum + block.size, 0);
  const totalChars = a.length + b.length;
  const ratio = totalChars > 0 ? (2 * totalMatched) / totalChars : 1.0;
  
  // Longest common run
  const longest = blocks.reduce((max, block) => Math.max(max, block.size), 0);
  
  return { ratio, blocks, longest };
}

/**
 * Get all files in a git tree reference, with their SHA1 hashes.
 * @param {string} repoPath - Path to the git repository
 * @param {string} ref - Git reference
 * @returns {Promise<Object>} Map of paths to SHA1 hashes
 */
function lsTree(repoPath, ref) {
  const result = spawnSync("git", ["-C", repoPath, "ls-tree", "-r", "-z", ref], {
    encoding: "utf8"
  });
  
  if (result.status !== 0) {
    throw new Error(`git ls-tree failed: ${result.stderr}`);
  }
  
  const entries = {};
  const output = result.stdout;
  const records = output.split("\0");
  
  for (const rec of records) {
    if (!rec) continue;
    const [meta, path] = rec.split("\t", 2);
    const [_mode, _type, sha] = meta.split(/\s+/);
    entries[path] = sha;
  }
  
  return entries;
}

/**
 * Get the content of a file at a specific git reference.
 * @param {string} repoPath - Path to the git repository
 * @param {string} ref - Git reference
 * @param {string} path - File path
 * @returns {Promise<string>} File content, or null if not found
 */
function getFileContent(repoPath, ref, filePath) {
  const result = spawnSync("git", ["-C", repoPath, "show", `${ref}:${filePath}`], {
    encoding: "utf8"
  });
  
  if (result.status !== 0) {
    return null;
  }
  
  return result.stdout.split("\n");
}

/**
 * Parse command line arguments.
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = {};
  let i = 2; // Skip node and script name
  
  while (i < process.argv.length) {
    const arg = process.argv[i];
    switch (arg) {
      case "--reference":
        args.reference = process.argv[++i];
        break;
      case "--max-ratio":
        args.maxRatio = parseFloat(process.argv[++i]);
        break;
      case "--max-run":
        args.maxRun = parseInt(process.argv[++i]);
        break;
      case "--out":
        args.out = process.argv[++i];
        break;
      case "--allowlist":
        args.allowlist = process.argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
    i++;
  }
  
  return args;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  
  const referencePath = args.reference;
  const outPath = args.out || path.join(__dirname, "..", "docs", "authorship-baseline.csv");
  const allowlistPath = args.allowlist || path.join(__dirname, "upstream-allowlist.json");
  
  // Check for reference path or fallback to upstream/main
  let upstreamRef = "upstream/main";
  if (referencePath) {
    upstreamRef = "upstream-main";
  }
  
  // Get the current repository path
  const repoPath = process.cwd();
  
  // Get the git trees
  let headEntries;
  let upstreamEntries;
  
  try {
    headEntries = lsTree(repoPath, "HEAD");
  } catch (e) {
    console.error("Error reading HEAD tree:", e.message);
    process.exit(1);
  }
  
  try {
    if (referencePath) {
      upstreamEntries = lsTree(referencePath, upstreamRef);
    } else {
      upstreamEntries = lsTree(repoPath, upstreamRef);
    }
  } catch (e) {
    console.error("Error reading upstream tree:", e.message);
    process.exit(1);
  }
  
  const common = Object.keys(headEntries).filter(p => upstreamEntries.hasOwnProperty(p));
  
  // Load allowlist
  let allowlist = [];
  try {
    const allowlistContent = await readFile(allowlistPath, "utf8");
    allowlist = JSON.parse(allowlistContent);
  } catch (e) {
    // File doesn't exist or is invalid, treat as empty list
  }
  
  const allowlistSet = new Set(allowlist.map(item => item.path));
  
  // Get identical blobs
  const identicalBlobs = common.filter(p => headEntries[p] === upstreamEntries[p]);
  
  // Compare files
  const rows = [];
  let failed = false;
  
  for (const filePath of common) {
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXT.has(ext)) {
      continue;
    }
    
    const a = getFileContent(referencePath || repoPath, referencePath ? upstreamRef : upstreamRef, filePath);
    const b = getFileContent(repoPath, "HEAD", filePath);
    
    if (!a || !b) {
      continue; // Skip if content could not be retrieved
    }
    
    const { ratio, blocks, longest } = sequenceMatcher(a, b);
    
    // Count only "substantive" shared lines: non-empty, not a lone brace/paren.
    let shared = 0;
    for (const block of blocks) {
      for (let i = block.a; i < block.a + block.size; i++) {
        const s = a[i]?.trim() || "";
        if (s.length > 3 && !["});", "};", ")};"].includes(s)) {
          shared += 1;
        }
      }
    }
    
    const row = {
      path: filePath,
      upstream_lines: a.length,
      head_lines: b.length,
      ratio: Math.round(ratio * 10000) / 10000,
      longest_common_run: longest,
      shared_substantive_lines: shared,
      byte_identical: headEntries[filePath] === upstreamEntries[filePath]
    };
    
    rows.push(row);
    
    // Check for failures based on limits
    if (!allowlistSet.has(filePath)) {
      if (args.maxRatio !== undefined && ratio >= args.maxRatio) {
        console.error(`FAIL: ratio ${ratio} >= ${args.maxRatio} for ${filePath}`);
        failed = true;
      }
      if (args.maxRun !== undefined && longest >= args.maxRun) {
        console.error(`FAIL: longest run ${longest} >= ${args.maxRun} for ${filePath}`);
        failed = true;
      }
    }
  }
  
  // Sort rows
  rows.sort((a, b) => {
    if (b.shared_substantive_lines !== a.shared_substantive_lines) {
      return b.shared_substantive_lines - a.shared_substantive_lines;
    }
    return a.path.localeCompare(b.path);
  });
  
  // Write CSV
  const header = ["path", "upstream_lines", "head_lines", "ratio", "longest_common_run", "shared_substantive_lines", "byte_identical"];
  const csvRows = [header.join(",")];
  for (const row of rows) {
    csvRows.push([
      `"${row.path}"`,
      row.upstream_lines,
      row.head_lines,
      row.ratio,
      row.longest_common_run,
      row.shared_substantive_lines,
      row.byte_identical
    ].join(","));
  }
  
  await writeFile(outPath, csvRows.join("\n") + "\n");
  
  // Print summary
  const srcRows = rows.filter(r => r.path.startsWith("src/"));
  
  function bucket(rs, lo, hi = 1.01) {
    return rs.filter(r => lo <= r.ratio && r.ratio < hi);
  }
  
  console.log(`paths in both HEAD and upstream/main: ${common.length}`);
  console.log(`byte-identical blobs (any type):      ${identicalBlobs.length}`);
  console.log(`text files compared:                  ${rows.length}  (src/: ${srcRows.length})`);
  console.log();
  
  console.log("src/ files by difflib line-similarity to upstream:");
  for (const [lo, hi, label] of [
    [0.95, 1.01, ">=95%"],
    [0.80, 0.95, "80-95%"],
    [0.60, 0.80, "60-80%"],
    [0.40, 0.60, "40-60%"],
    [0.00, 0.40, "<40%"]
  ]) {
    const b = bucket(srcRows, lo, hi);
    const totalLines = b.reduce((sum, r) => sum + r.shared_substantive_lines, 0);
    console.log(`  ${label}: ${b.length.toString().padStart(4)} files, ${totalLines.toString().padStart(6)} shared substantive lines`);
  }
  console.log();
  
  console.log("top 30 src/ files by shared substantive lines:");
  for (const r of srcRows.slice(0, 30)) {
    console.log(
      `  ${r.shared_substantive_lines.toString().padStart(5)} shared  ratio=${r.ratio.toFixed(2)}  ` +
      `run=${r.longest_common_run.toString().padStart(4)}  ${r.path} (${r.head_lines} lines)`
    );
  }
  console.log();
  
  console.log("byte-identical blobs still in the tree:");
  for (const p of identicalBlobs) {
    console.log(`  ${p}`);
  }
  console.log();
  
  console.log(`csv: ${outPath}`);
  
  if (failed) {
    process.exitCode = 1;
  }
}

// Run main function
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});