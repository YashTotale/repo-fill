import { rm, readFile, writeFile } from "fs/promises";
import { join } from "path";

const generatedPath = join(__dirname, "..", "..", "generated.json");

export const deleteGeneratedFile = async () => {
  await rm(generatedPath, { force: true });
};

export const addToGeneratedFile = async (repo: string, files: string[]) => {
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
