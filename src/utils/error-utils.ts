// Externals
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

// Internals
import { OUTPUT_PATH } from "../constants";

const ERRORS_FILE_PATH = join(OUTPUT_PATH, "errors.json");

export const errorEncountered = async (e: Error, message: string) => {
  defineErrorToJson();
  if (!existsSync(OUTPUT_PATH)) await mkdir(OUTPUT_PATH);

  let errors: Error[];
  try {
    const errs = await readFile(ERRORS_FILE_PATH, "utf-8");
    errors = JSON.parse(errs);
  } catch (e) {
    errors = [];
  }

  errors.push(e);

  await writeFile(ERRORS_FILE_PATH, JSON.stringify(errors), "utf-8");

  console.log(message);
};

const defineErrorToJson = () => {
  if (!("toJSON" in Error.prototype))
    Object.defineProperty(Error.prototype, "toJSON", {
      value: function () {
        var alt = {};

        Object.getOwnPropertyNames(this).forEach(function (key) {
          //@ts-ignore
          alt[key] = this[key];
        }, this);

        return alt;
      },
      configurable: true,
      writable: true,
    });
};
