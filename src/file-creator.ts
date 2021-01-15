// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { red } from "chalk";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import {
  getTemplates,
  TemplateDirs,
  TemplateFiles,
} from "./utils/template-utils";
import { getUserData, User } from "./utils/user-utils";
import { addToGeneratedFile } from "./utils/generated-utils";
import { errorEncountered } from "./utils/error-utils";
import {
  createLabels,
  getRepoLabels,
  RepoLabels,
} from "./creators/label-creator";
import { checkOrg, axiosGet, logRateLimit, deleteOutput } from "./helpers";
import { Repo } from "./types";

config();

yargs(process.argv.slice(2)).argv;

const REPO_FILE = (repo: Repo) =>
  `repo-files/${checkOrg(repo)}${repo.name}.json`;
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

    const missingFiles = getMissingFiles(repoContents, templateFiles);

    if (Object.keys(missingFiles).length) {
      await createFiles(octokit, repo, repoContents, user, missingFiles);
    }

    await createMissingDirs(octokit, repo, repoDirContents, user, templateDirs);

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

type BaseRepoContent = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"];

type ArrRepoContent = Extract<BaseRepoContent, Array<any>>;

type DirRepoContent = Record<string, ArrRepoContent>;

const getRepo = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  cache: Cache
): Promise<[ArrRepoContent, DirRepoContent, RepoLabels]> => {
  const cachedFile = cache[REPO_FILE(repo)];
  const cachedDirFile = cache[REPO_DIR(repo)];

  let repoFileContents: ArrRepoContent;

  if (typeof cachedFile === "string") repoFileContents = JSON.parse(cachedFile);
  else repoFileContents = await getRepoFiles(repo);

  let repoDirContents: DirRepoContent = {};

  if (typeof cachedDirFile === "string")
    repoDirContents = JSON.parse(cachedDirFile);
  else
    repoDirContents = await getRepoDirs(repo, templateDirs, repoFileContents);

  return [repoFileContents, repoDirContents, await getRepoLabels(repo, cache)];
};

const getRepoFiles = async (
  repo: Repo,
  addition?: RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]["data"]["content"],
  existingRepoContents?: ArrRepoContent
) => {
  const repoFile = REPO_FILE(repo);

  if (!addition) {
    console.log(`Getting repo '${repo.name}'...`);
    const { data: repoContents } = await axiosGet(
      repo.contents_url.replace("{+path}", "")
    );
    await writeToCache(repoFile, JSON.stringify(repoContents));
    return repoContents;
  } else if (existingRepoContents) {
    existingRepoContents.push(addition);
    await writeToCache(repoFile, JSON.stringify(existingRepoContents));
    return existingRepoContents;
  }
};

const getRepoDirs = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  repoFileContents: ArrRepoContent
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
        data: ArrRepoContent;
      } = await axiosGet(found.url);

      for (const content of dirContents) {
        if (content.type === "dir") {
          const type = typeof templateDirs[dir];
          if (type !== "undefined" && type !== "string") {
            const { data }: { data: ArrRepoContent } = await axiosGet(
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
};

const getMissingFiles = (
  repoContents: ArrRepoContent,
  templates: TemplateFiles
) => {
  const missing = { ...templates };

  Object.keys(templates).forEach((template) => {
    const found = repoContents.find(
      (content) => content.type === "file" && content.name === template
    );

    if (found) delete missing[template];
  });

  return missing;
};

const createFiles = async (
  octokit: Octokit,
  repo: Repo,
  repoContents: ArrRepoContent,
  user: User,
  missing: TemplateFiles
) => {
  for (const file in missing) {
    console.log(`Creating file '${file}'...`);

    const contents = missing[file];

    const response = await commitFile(octokit, repo, user, contents, file);

    if (response !== null) {
      await getRepoFiles(repo, response.data.content, repoContents);
    }
  }

  await addToGeneratedFile(repo.name, Object.keys(missing));
};

const createMissingDirs = async (
  octokit: Octokit,
  repo: Repo,
  repoDirContents: Record<string, ArrRepoContent>,
  user: User,
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

const commitFile = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  content: string,
  path: string
) => {
  const replacements = {
    "{{repo-name}}": repo.name,
    "{{repo-full-name}}": repo.full_name,
    "{{user-name}}": user.name ?? user.login,
    "{{year}}": new Date().getFullYear().toString(),
  };

  Object.entries(replacements).forEach(([key, value]) => {
    content = content.replaceAll(key, value);
  });

  try {
    return octokit.repos.createOrUpdateFileContents({
      owner: repo.owner?.login ?? user.login,
      repo: repo.name,
      content: Buffer.from(content).toString("base64"),
      message: `Added ${path}`,
      path,
    });
  } catch (e) {
    await errorEncountered(e, red(`Could not create file '${path}'`));
    return null;
  }
};

fileCreator();
