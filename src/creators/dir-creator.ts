// Externals
import { Octokit } from "@octokit/rest";

// Internals
import { RepoFiles } from "./file-creator";
import { Cache, writeToCache } from "../utils/cache-utils";
import { addToGeneratedFile } from "../utils/generated-utils";
import { errorEncountered } from "../utils/error-utils";
import { User } from "../utils/user-utils";
import { TemplateDirs } from "../utils/template-utils";
import { axiosGet, checkOrg, commitFile } from "../helpers";
import { Repo } from "../types";

export type RepoDirs = Record<string, RepoFiles>;

export const REPO_DIR = (repo: Repo): string =>
  `repo-dirs/${checkOrg(repo)}${repo.name}.json`;

export const getRepoDirs = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  repoFileContents: RepoFiles,
  cache: Cache
): Promise<RepoDirs | null> => {
  try {
    const cachedDirFile = cache[REPO_DIR(repo)];

    if (typeof cachedDirFile === "string") return JSON.parse(cachedDirFile);
    else {
      const repoDirContents: RepoDirs = {};

      console.log(`Getting repo '${repo.name}' dirs...`);
      for (const dir in templateDirs) {
        const found = repoFileContents.find(
          (content) => content.type === "dir" && content.name === dir
        );

        if (typeof found === "undefined") repoDirContents[dir] = [];
        else {
          let {
            data: dirContents,
          }: {
            data: RepoFiles;
          } = await axiosGet(found.url);

          for (const content of dirContents) {
            if (content.type === "dir") {
              const type = typeof templateDirs[dir];
              if (type !== "undefined" && type !== "string") {
                const { data }: { data: RepoFiles } = await axiosGet(
                  content.url
                );
                dirContents = dirContents.concat(data);
              }
            }
          }

          repoDirContents[dir] = dirContents;
        }
      }
      await writeToCache(REPO_DIR(repo), JSON.stringify(repoDirContents));
      return repoDirContents;
    }
  } catch (e) {
    await errorEncountered(e, `Could not get ${repo.name} dirs`);
    return null;
  }
};

export const createMissingDirs = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  repoDirContents: Record<string, RepoFiles>,
  templates: TemplateDirs
): Promise<void> => {
  const create = async (path: string, dir: string, content: string) => {
    console.log(`Creating file '${path}'...`);

    const response = await commitFile(octokit, repo, user, content, path);

    if (response !== null) {
      repoDirContents[dir].push(response.data.content);

      await writeToCache(REPO_DIR(repo), JSON.stringify(repoDirContents));

      await addToGeneratedFile(repo.name, path);
    }
  };
  for (const dir in templates) {
    const contents = templates[dir];
    const corresponding = repoDirContents[dir];

    for (const content in contents) {
      const value = contents[content];

      if (typeof value === "string") {
        const found = corresponding.find(
          (real) => real.type === "file" && real.name === content
        );

        if (!found) await create(`${dir}/${content}`, dir, value);
      } else {
        for (const file in value) {
          const path = `${dir}/${content}/${file}`;

          const found = corresponding.find(
            (real) => real.type === "file" && real.path === path
          );

          if (!found) await create(path, dir, value[file]);
        }
      }
    }
  }
};
