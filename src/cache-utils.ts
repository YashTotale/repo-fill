import { readFileSync } from "fs";
import { readdir, writeFile } from "fs/promises";
import { join } from "path";

const cachePath = join(__dirname, "..", "cache");

export const getCacheContents = async (): Promise<Record<string, string>> => {
  try {
    const contents = await readdir(cachePath);

    return contents.reduce((obj, fileName) => {
      return {
        ...obj,
        [fileName]: readFileSync(join(cachePath, fileName), "utf-8"),
      };
    }, {});
  } catch (e) {
    return {};
  }
};

export const writeToCache = async (file: string, data: string) => {
  await writeFile(join(cachePath, file), data, "utf-8");
};
