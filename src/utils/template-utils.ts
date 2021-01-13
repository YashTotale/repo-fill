import { readdir, readFile } from "fs/promises";
import { join } from "path";

export type Templates = Record<string, string>;

const templatesPath = join(__dirname, "..", "..", "templates");

export const getTemplates = async () => {
  return Promise.all([getTemplateFiles(), getTemplateDirs()]);
};

export const getTemplateFiles = async (): Promise<Templates> => {
  const filesPath = join(templatesPath, "files");

  const files = await readdir(filesPath);

  const contents = await Promise.all(
    files.map(async (file) => readFile(join(filesPath, file), "utf-8"))
  );

  return files.reduce(
    (object, file, i) => ({ ...object, [file]: contents[i] }),
    {}
  );
};

export const getTemplateDirs = async () => {
  const dirsPath = join(templatesPath, "dirs");

  const dirs = await readdir(dirsPath);

  const dirContents: Record<string, Record<string, string>> = {};

  for (const dir of dirs) {
    const dirPath = join(dirsPath, dir);

    const files = await readdir(dirPath);
    for (const file of files) {
      const fileContents = await readFile(join(dirPath, file), "utf-8");
      dirContents[dir] = { ...dirContents[dir], [file]: fileContents };
    }
  }

  return dirContents;
};
