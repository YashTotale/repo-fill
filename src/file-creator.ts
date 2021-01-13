// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import axios from "axios";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import { getTemplates, Templates } from "./utils/template-utils";
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

  const templates = await getTemplates();

  const user = await getUserData(octokit, cache);

  const repos = await getRepos(user, cache);

  for (const repo of repos) {
    const repoContents = await getRepo(repo, cache);

    const missing = getMissingFiles(repoContents, repo, user, templates);

    if (Object.keys(missing).length) {
      await createFiles(octokit, repo, repoContents, user, missing);
    }
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

const getRepo = async (repo: Repo, cache: Cache): Promise<ArrRepoContent> => {
  const repoFile = `repo-${repo.name}.json`;
  const cached = cache[repoFile];

  if (typeof cached === "string") return JSON.parse(cached);

  return createRepoCache(repo);
};

const createRepoCache = async (
  repo: Repo,
  addition?: RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]["data"]["content"],
  existingRepoContents?: ArrRepoContent
) => {
  const repoFile = `repo-${repo.name}.json`;

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
  templates: Templates
) => {
  const missing = { ...templates };

  Object.keys(templates).forEach((template) => {
    const found = repoContents.find((content) => {
      if (content.type === "file" && content.name === template) return true;
      return false;
    });

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

const createFiles = async (
  octokit: Octokit,
  repo: Repo,
  repoContents: ArrRepoContent,
  user: User,
  missing: Templates
) => {
  console.log(`Creating files for '${repo.name}'...`);

  for (const file in missing) {
    console.log(`Creating file '${file}' `);

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
