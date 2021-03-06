// Externals
import { readdir, readFile } from "fs/promises";
import { join } from "path";

// Internals
import { Label } from "../creators/label-creator";

export type TemplateFiles = Record<string, string>;

export type TemplateDirs = Record<
  string,
  Record<string, string | Record<string, string>>
>;

export type TemplateLabels = Record<string, Label>;

const templatesPath = join(__dirname, "..", "..", "templates");

export const getTemplates = async (): Promise<
  [TemplateFiles, TemplateDirs, TemplateLabels]
> => {
  return Promise.all([
    getTemplateFiles(),
    getTemplateDirs(),
    getTemplateLabels(),
  ]);
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

export const getTemplateLabels = async (): Promise<TemplateLabels> => {
  const labelsPath = join(templatesPath, "labels.json");

  const labels = await readFile(labelsPath, "utf-8");

  return JSON.parse(labels);
};
