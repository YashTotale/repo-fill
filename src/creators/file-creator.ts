// Externals
import { Octokit } from "@octokit/rest";

// Internals
import { Cache, writeToCache } from "../utils/cache-utils";
import { addToGeneratedFile } from "../utils/generated-utils";
import { User } from "../utils/user-utils";
import { TemplateFiles } from "../utils/template-utils";
import { axiosGet, checkOrg, commitFile } from "../helpers";
import { Repo, BaseRepoContent } from "../types";

export type RepoFiles = Extract<BaseRepoContent, Array<any>>;

const REPO_FILE = (repo: Repo) =>
  `repo-files/${checkOrg(repo)}${repo.name}.json`;

export const getRepoFiles = async (
  repo: Repo,
  cache: Cache
): Promise<RepoFiles> => {
  const cachedFile = cache[REPO_FILE(repo)];

  if (typeof cachedFile === "string") return JSON.parse(cachedFile);

  console.log(`Getting repo '${repo.name}' files...`);
  const { data: repoContents } = await axiosGet(
    repo.contents_url.replace("{+path}", "")
  );
  await writeToCache(REPO_FILE(repo), JSON.stringify(repoContents));
  return repoContents;
};

export const createFiles = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  repoContents: RepoFiles,
  templates: TemplateFiles
): Promise<void> => {
  for (const file in templates) {
    const found = repoContents.find(
      (content) => content.type === "file" && content.name === file
    );

    if (!found) {
      console.log(`Creating file '${file}'...`);

      const contents = templates[file];

      const response = await commitFile(octokit, repo, user, contents, file);

      if (response !== null) {
        repoContents.push(response.data.content);
        await writeToCache(REPO_FILE(repo), JSON.stringify(repoContents));
        await addToGeneratedFile(repo.name, [file]);
      }
    }
  }
};
