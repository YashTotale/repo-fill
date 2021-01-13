// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import axios from "axios";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import {
  getTemplates,
  TemplateDirs,
  TemplateFiles,
} from "./utils/template-utils";
import {
  addToGeneratedFile,
  deleteGeneratedFile,
} from "./utils/generated-utils";

config();

yargs(process.argv.slice(2)).argv;

const fileCreator = async () => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  await deleteGeneratedFile();

  const cache = await getCacheContents();

  const [templateFiles, templateDirs] = await getTemplates();

  const user = await getUserData(octokit, cache);

  const repos = await getRepos(user, cache);

  for (const repo of repos) {
    const [repoContents, repoDirContents] = await getRepo(
      repo,
      templateDirs,
      cache
    );

    const missingFiles = getMissingFiles(
      repoContents,
      repo,
      user,
      templateFiles
    );

    console.log(`\nCreating files for '${repo.name}'...`);
    if (Object.keys(missingFiles).length) {
      await createFiles(octokit, repo, repoContents, user, missingFiles);
    }

    await createMissingDirs(octokit, repo, repoDirContents, user, templateDirs);
  }
};

type User = RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"];

const getUserData = async (octokit: Octokit, cache: Cache): Promise<User> => {
  const userDataFile = "user-data.json";
  const cached = cache[userDataFile];

  if (typeof cached === "string") return JSON.parse(cached);

  console.log("Getting user...");
  const { data: user } = await octokit.users.getAuthenticated();

  writeToCache(userDataFile, JSON.stringify(user));

  return user;
};

type Repo = RestEndpointMethodTypes["repos"]["get"]["response"]["data"];

const getRepos = async (user: User, cache: Cache): Promise<Repo[]> => {
  const reposFile = "repos.json";
  const cached = cache[reposFile];

  if (typeof cached === "string") return JSON.parse(cached);

  console.log("Getting repos...");
  const { data: repos } = await axios.get(user.repos_url);

  writeToCache(reposFile, JSON.stringify(repos));

  return repos;
};

type BaseRepoContent = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"];

type ArrRepoContent = Extract<BaseRepoContent, Array<any>>;

const getRepo = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  cache: Cache
): Promise<[ArrRepoContent, any]> => {
  const repoFile = `repo-files/repo-${repo.name}.json`;
  const repoDirFile = `repo-dirs/repo-${repo.name}-dirs.json`;

  const cachedFile = cache[repoFile];
  const cachedDirFile = cache[repoDirFile];

  let repoFileContents: ArrRepoContent;

  if (typeof cachedFile === "string") repoFileContents = JSON.parse(cachedFile);
  else repoFileContents = await createRepoCache(repo);

  let repoDirContents = {};

  if (typeof cachedDirFile === "string")
    repoDirContents = JSON.parse(cachedDirFile);
  else {
    console.log(`Getting repo '${repo.name}' dirs...`);
    for (const dir in templateDirs) {
      const found = repoFileContents.find(
        (content) => content.type === "dir" && content.name === dir
      );

      if (typeof found === "undefined") repoDirContents[dir] = [];
      else {
        const { data: dirContents } = await axios.get(found.url);
        repoDirContents[dir] = dirContents;
      }
    }
    writeToCache(repoDirFile, JSON.stringify(repoDirContents));
  }

  return [repoFileContents, repoDirContents];
};

const createRepoCache = async (
  repo: Repo,
  addition?: RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]["data"]["content"],
  existingRepoContents?: ArrRepoContent
) => {
  const repoFile = `repo-files/repo-${repo.name}.json`;

  if (!addition) {
    console.log(`Getting repo '${repo.name}'...`);
    const { data: repoContents } = await axios.get(
      repo.contents_url.replace("{+path}", "")
    );
    writeToCache(repoFile, JSON.stringify(repoContents));
    return repoContents;
  } else if (existingRepoContents) {
    existingRepoContents.push(addition);
    writeToCache(repoFile, JSON.stringify(existingRepoContents));
    return existingRepoContents;
  }
};

const getMissingFiles = (
  repoContents: ArrRepoContent,
  repo: Repo,
  user: User,
  templates: TemplateFiles
) => {
  const missing = { ...templates };

  Object.keys(templates).forEach((template) => {
    const found = repoContents.find(
      (content) => content.type === "file" && content.name === template
    );

    if (found) delete missing[template];
    else {
      const replacements = {
        "{{repo-name}}": repo.name,
        "{{user-name}}": user.name ?? user.login,
        "{{year}}": new Date().getFullYear().toString(),
      };

      Object.entries(replacements).forEach(([key, value]) => {
        missing[template] = missing[template].replace(key, value);
      });
    }
  });

  return missing;
};

const createMissingDirs = async (
  octokit: Octokit,
  repo: Repo,
  repoDirContents: Record<string, ArrRepoContent>,
  user: User,
  templates: TemplateDirs
) => {
  for (const dir in templates) {
    const files = templates[dir];
    const corresponding = repoDirContents[dir];

    for (const file in files) {
      const found = corresponding.find(
        (content) => content.type === "file" && content.name === file
      );

      if (!found) {
        const path = `${dir}/${file}`;
        console.log(`\nCreating file '${path}'...`);

        const { data } = await octokit.repos.createOrUpdateFileContents({
          owner: user.login,
          repo: repo.name,
          content: Buffer.from(files[file]).toString("base64"),
          message: `Added ${path}`,
          path,
        });

        repoDirContents[dir].push(data.content);

        await writeToCache(
          `repo-dirs/repo-${repo.name}-dirs.json`,
          JSON.stringify(repoDirContents)
        );

        await addToGeneratedFile(repo.name, [path]);
      }
    }
  }
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

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repo.name,
      content: Buffer.from(contents).toString("base64"),
      message: `Added ${file}`,
      path: file,
    });

    await createRepoCache(repo, data.content, repoContents);
  }

  await addToGeneratedFile(repo.name, Object.keys(missing));
};

fileCreator();
