import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const buildDirectory = join(process.cwd(), ".next");
const appChunksDirectory = join(buildDirectory, "static", "chunks", "app");
const cssDirectory = join(buildDirectory, "static", "css");
const maximumRouteBytes = 80 * 1024;
const maximumDynamicBytes = 120 * 1024;
const maximumCssBytes = 112 * 1024;
const check = process.argv.includes("--check");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return nested.flat();
}

async function measurement(path) {
  const body = await readFile(path);
  return {
    file: relative(buildDirectory, path).replaceAll("\\", "/"),
    bytes: body.byteLength,
    gzipBytes: gzipSync(body).byteLength,
  };
}

async function main() {
  const routeFiles = (await filesBelow(appChunksDirectory)).filter(
    (path) => /[\\/]page-[^\\/]+\.js$/.test(path),
  );
  const routeMeasurements = await Promise.all(routeFiles.map(measurement));
  const loadable = JSON.parse(
    await readFile(join(buildDirectory, "react-loadable-manifest.json"), "utf8"),
  );
  const dynamicFiles = [
    ...new Set(
      Object.values(loadable).flatMap((entry) =>
        entry.files.filter((file) => file.endsWith(".js")),
      ),
    ),
  ];
  const dynamicMeasurements = await Promise.all(
    dynamicFiles.map((file) => measurement(join(buildDirectory, file))),
  );
  const cssFiles = (await filesBelow(cssDirectory)).filter((file) =>
    file.endsWith(".css"),
  );
  const cssMeasurements = await Promise.all(cssFiles.map(measurement));

  const print = (label, rows) => {
    console.log(label);
    for (const row of rows.sort((left, right) => right.bytes - left.bytes)) {
      console.log(
        `${String(Math.ceil(row.bytes / 1024)).padStart(4)} KiB raw · ${String(
          Math.ceil(row.gzipBytes / 1024),
        ).padStart(3)} KiB gzip · ${row.file}`,
      );
    }
  };
  print("Route client chunks", routeMeasurements);
  print("Lazy client chunks", dynamicMeasurements);
  print("CSS chunks", cssMeasurements);

  if (!check) return;
  const violations = [
    ...routeMeasurements
      .filter((entry) => entry.bytes > maximumRouteBytes)
      .map((entry) => `route:${entry.file}`),
    ...dynamicMeasurements
      .filter((entry) => entry.bytes > maximumDynamicBytes)
      .map((entry) => `lazy:${entry.file}`),
    ...cssMeasurements
      .filter((entry) => entry.bytes > maximumCssBytes)
      .map((entry) => `css:${entry.file}`),
  ];
  if (violations.length) {
    throw new Error(`Client bundle budget exceeded: ${violations.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
