import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const cachePath = join(__dirname, "..", "cache");

export const getCacheContents = async (): Promise<Record<string, string>> => {
  try {
    const files = await readdir(cachePath);

    const contents = await Promise.all(
      files.map(async (file) => readFile(join(cachePath, file), "utf-8"))
    );

    return files.reduce(
      (object, file, i) => ({ ...object, [file]: contents[i] }),
      {}
    );
  } catch (e) {
    return {};
  }
};

export const writeToCache = async (file: string, data: string) => {
  await writeFile(join(cachePath, file), data, "utf-8");
};
