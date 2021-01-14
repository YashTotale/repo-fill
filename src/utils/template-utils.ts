import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

import recursive from "recursive-readdir";

export type TemplateFiles = Record<string, string>;

export type TemplateDirs = Record<
  string,
  Record<string, string | Record<string, string>>
>;

const templatesPath = join(__dirname, "..", "..", "templates");

export const getTemplates = async () => {
  return Promise.all([getTemplateFiles(), getTemplateDirs()]);
};

export const getTemplateFiles = async (): Promise<TemplateFiles> => {
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

export const getTemplateDirs = async (): Promise<TemplateDirs> => {
  const dirsPath = join(templatesPath, "dirs");

  const dirs = await readdir(dirsPath);

  const dirContents: TemplateDirs = {};

  for (const dir of dirs) {
    const dirPath = join(dirsPath, dir);

    const items = await readdir(dirPath);
    for (const item of items) {
      const itemPath = join(dirPath, item);
      try {
        const contents = await readFile(itemPath, "utf-8");
        dirContents[dir] = {
          ...dirContents[dir],
          [item]: contents,
        };
      } catch (e) {
        const contents = await readdir(itemPath, "utf-8");
        dirContents[dir] = {
          ...dirContents[dir],
          [item]: (
            await Promise.all(
              contents.map((file) => readFile(join(itemPath, file), "utf-8"))
            )
          ).reduce((obj, fileContent, i) => {
            return { ...obj, [contents[i]]: fileContent };
          }, {} as Record<string, string>),
        };
      }
    }
  }

  return dirContents;
};
