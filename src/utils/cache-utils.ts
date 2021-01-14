import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative } from "path";

import recursive from "recursive-readdir";

export type Cache = Record<string, string>;

const cachePath = join(__dirname, "..", "..", "cache");

export const getCacheContents = async (): Promise<Cache> => {
  try {
    const files = await recursive(cachePath);

    const contents = await Promise.all(
      files.map(async (file) => readFile(file, "utf-8"))
    );

    return files.reduce(
      (object, file, i) => ({
        ...object,
        [relative(cachePath, file)]: contents[i],
      }),
      {}
    );
  } catch (e) {
    return {};
  }
};

export const writeToCache = async (file: string, data: string) => {
  const dirs = [
    join(cachePath, "repo-files"),
    join(cachePath, "repo-dirs"),
    join(cachePath, "org-repos"),
  ];

  for (const dir of dirs) {
    try {
      await readdir(dir);
    } catch (e) {
      await mkdir(dir, { recursive: true });
    }
  }

  await writeFile(join(cachePath, file), data, "utf-8");
};
