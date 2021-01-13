import { readdir, readFile } from "fs/promises";
import { join } from "path";

export type Templates = Record<string, string>;

const templatesPath = join(__dirname, "..", "..", "templates");

export const getTemplates = async (): Promise<Templates> => {
  const files = await readdir(templatesPath);

  const contents = await Promise.all(
    files.map(async (file) => readFile(join(templatesPath, file), "utf-8"))
  );

  return files.reduce(
    (object, file, i) => ({ ...object, [file]: contents[i] }),
    {}
  );
};
