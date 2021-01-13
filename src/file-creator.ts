// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import axios from "axios";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import { getTemplates, Templates } from "./utils/template-utils";

config();

yargs(process.argv.slice(2)).argv;

const fileCreator = async () => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const [cache, templates] = await Promise.all([
    getCacheContents(),
    getTemplates(),
  ]);

  const user = await getUserData(octokit, cache);

  const repos = await getRepos(user, cache);

  repos.forEach(async (repo) => {
    const repoContents = await getRepo(repo, cache);
    const missing = getMissingFiles(repoContents, templates);
    await createFiles(octokit, repo, user, missing);
  });
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

type RepoContent = Extract<
  RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"],
  Array<any>
>;

const getRepo = async (repo: Repo, cache: Cache): Promise<RepoContent> => {
  const repoFile = `repo-${repo.name}.json`;
  const cached = cache[repoFile];

  if (typeof cached === "string") return JSON.parse(cached);

  return createRepoCache(repo);
};

const createRepoCache = async (repo: Repo) => {
  const repoFile = `repo-${repo.name}.json`;

  console.log(`Getting repo '${repo.name}'...`);
  const { data: repoContents } = await axios.get(
    repo.contents_url.replace("{+path}", "")
  );

  writeToCache(repoFile, JSON.stringify(repoContents));
  return repoContents;
};

const getMissingFiles = (repoContents: RepoContent, templates: Templates) => {
  const missing = { ...templates };

  Object.keys(templates).forEach((template) => {
    const found = repoContents.find((content) => {
      if (content.type === "file" && content.name === template) return true;
      return false;
    });

    if (found) delete missing[template];
  });

  return missing;
};

const createFiles = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  missing: Templates
) => {
  console.log(`Missing for ${repo.name} is ${Object.keys(missing)}`);

  Object.entries(missing).forEach(([key, value]) => {
    octokit.repos.createOrUpdateFileContents({
      owner: user.login ?? "",
      repo: repo.name,
      content: Buffer.from(value).toString("base64"),
      message: `Added ${key}`,
      path: key,
    });
  });

  await createRepoCache(repo);
};

fileCreator();
