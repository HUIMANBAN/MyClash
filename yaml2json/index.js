#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import YAML from "yaml";

function printUsage() {
  console.log(`Usage:
  node index.js <input.yaml> [output.json]
  node index.js - [output.json]

Use "-" (or omit the input path) to read YAML from stdin.`);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      content += chunk;
    });
    process.stdin.on("end", () => resolve(content));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    return;
  }

  if (args.length > 2) {
    throw new Error("Too many arguments. Use --help to see the supported syntax.");
  }

  const [inputPath = "-", outputPath] = args;
  const source = inputPath === "-"
    ? await readStdin()
    : await readFile(inputPath, "utf8");

  const documents = YAML.parseAllDocuments(source);
  const errors = documents.flatMap((document) => document.errors);

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("\n"));
  }

  const values = documents.map((document) => document.toJS());
  const result = values.length === 1 ? values[0] : values;
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    await writeFile(outputPath, json, "utf8");
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(`yaml2json: ${error.message}`);
  process.exitCode = 1;
});
