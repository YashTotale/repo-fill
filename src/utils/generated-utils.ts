// Externals
import { existsSync } from "fs";
import { rm, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

// Internals
import { OUTPUT_PATH } from "../constants";

const generatedPath = join(OUTPUT_PATH, "generated.json");

export const deleteGeneratedFile = async (): Promise<void> => {
  await rm(generatedPath, { force: true });
};

export const addToGeneratedFile = async (
  repo: string,
  files: string[]
): Promise<void> => {
  if (!existsSync(OUTPUT_PATH)) await mkdir(OUTPUT_PATH);
  try {
    const current = await readFile(generatedPath, "utf-8");
    try {
      const json = JSON.parse(current);

      const newJson = {
        ...json,
        [repo]: json.repo ? [...json.repo, ...files] : [...files],
      };

      await writeFile(generatedPath, JSON.stringify(newJson), "utf-8");
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  } catch (e) {
    const json = {
      [repo]: [...files],
    };

    await writeFile(generatedPath, JSON.stringify(json), "utf-8");
  }
};
