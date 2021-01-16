// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import { getTemplates, TemplateDirs } from "./utils/template-utils";
import { getUserData, User } from "./utils/user-utils";
import { addToGeneratedFile } from "./utils/generated-utils";
import {
  createLabels,
  getRepoLabels,
  RepoLabels,
} from "./creators/label-creator";
import {
  checkOrg,
  axiosGet,
  logRateLimit,
  deleteOutput,
  commitFile,
} from "./helpers";
import { Repo } from "./types";
import { createFiles, getRepoFiles, RepoFiles } from "./creators/file-creator";

config();

yargs(process.argv.slice(2)).argv;

const REPO_DIR = (repo: Repo) => `repo-dirs/${checkOrg(repo)}${repo.name}.json`;

const fileCreator = async () => {
  const octokit = new Octokit({
    auth: `token ${process.env.GITHUB_TOKEN}`,
    userAgent: "YashTotale",
  });

  const [
    cache,
    [templateFiles, templateDirs, templateLabels],
  ] = await Promise.all([
    await getCacheContents(),
    await getTemplates(),
    await deleteOutput(),
  ]);

  const user = await getUserData(octokit, cache);

  const repos = await getRepos(user, cache);

  for (const repo of repos) {
    console.log("\n" + repo.name);
    const [repoContents, repoDirContents, repoLabelContents] = await getRepo(
      repo,
      templateDirs,
      cache
    );

    await createFiles(octokit, repo, user, repoContents, templateFiles);

    await createMissingDirs(octokit, repo, user, repoDirContents, templateDirs);

    await createLabels(octokit, repo, user, repoLabelContents, templateLabels);

    await logRateLimit(octokit);
  }
};

type Org = RestEndpointMethodTypes["orgs"]["get"]["response"]["data"];

const getRepos = async (user: User, cache: Cache): Promise<Repo[]> => {
  const reposFile = "repos.json";
  const orgsFile = "orgs.json";

  const cachedFiles = cache[reposFile];
  const cachedOrgs = cache[orgsFile];

  let repos: Repo[] = [];

  if (typeof cachedFiles === "string") repos = JSON.parse(cachedFiles);
  else {
    console.log("Getting repos...");
    const { data } = await axiosGet(user.repos_url);
    repos = data;
  }

  let orgs: Org[] = [];
  if (typeof cachedOrgs === "string") orgs = JSON.parse(cachedOrgs);
  else {
    console.log("Getting orgs...");
    const { data } = await axiosGet(user.organizations_url);
    orgs = data;
  }
  await writeToCache(reposFile, JSON.stringify(repos));

  for (const org of orgs) {
    const orgFile = `org-repos/${org.login}.json`;
    const cachedOrg = cache[orgFile];

    let orgRepos;
    if (typeof cachedOrg === "string") orgRepos = JSON.parse(cachedOrg);
    else {
      console.log(`Getting org ${org.login}...`);
      const { data } = await axiosGet(org.repos_url);
      orgRepos = data;
    }
    repos = repos.concat(orgRepos);
    await writeToCache(orgFile, JSON.stringify(orgRepos));
  }

  await writeToCache(orgsFile, JSON.stringify(orgs));

  return repos;
};

type DirRepoContent = Record<string, RepoFiles>;

const getRepo = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  cache: Cache
): Promise<[RepoFiles, DirRepoContent, RepoLabels]> => {
  const cachedDirFile = cache[REPO_DIR(repo)];

  const repoFileContents = await getRepoFiles(repo, cache);

  let repoDirContents: DirRepoContent = {};

  if (typeof cachedDirFile === "string")
    repoDirContents = JSON.parse(cachedDirFile);
  else
    repoDirContents = await getRepoDirs(repo, templateDirs, repoFileContents);

  const repoLabelContents = await getRepoLabels(repo, cache);

  return [repoFileContents, repoDirContents, repoLabelContents];
};

const getRepoDirs = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  repoFileContents: RepoFiles
) => {
  const repoDirContents: DirRepoContent = {};

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
            const { data }: { data: RepoFiles } = await axiosGet(content.url);
            dirContents = dirContents.concat(data);
          }
        }
      }

      repoDirContents[dir] = dirContents;
    }
  }
  await writeToCache(REPO_DIR(repo), JSON.stringify(repoDirContents));
  return repoDirContents;
};

const createMissingDirs = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  repoDirContents: Record<string, RepoFiles>,
  templates: TemplateDirs
) => {
  const create = async (path: string, dir: string, content: string) => {
    console.log(`Creating file '${path}'...`);

    const response = await commitFile(octokit, repo, user, content, path);

    if (response !== null) {
      repoDirContents[dir].push(response.data.content);

      await writeToCache(REPO_DIR(repo), JSON.stringify(repoDirContents));

      await addToGeneratedFile(repo.name, [path]);
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

fileCreator();
