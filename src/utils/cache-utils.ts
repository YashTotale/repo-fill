import { readFile, writeFile } from "fs/promises";
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
        [relative(join(__dirname, "..", "..", "cache"), file)]: contents[i],
      }),
      {}
    );
  } catch (e) {
    return {};
  }
};

export const writeToCache = async (file: string, data: string) => {
  await writeFile(join(cachePath, file), data, "utf-8");
};
