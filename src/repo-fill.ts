// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

// Internals
import { getCacheContents, writeToCache, Cache } from "./utils/cache-utils";
import { getTemplates, TemplateDirs } from "./utils/template-utils";
import { getUserData, User } from "./utils/user-utils";
import {
  createLabels,
  getRepoLabels,
  RepoLabels,
} from "./creators/label-creator";
import { axiosGet, logRateLimit, deleteOutput } from "./helpers";
import { Repo } from "./types";
import { createFiles, getRepoFiles, RepoFiles } from "./creators/file-creator";
import {
  createMissingDirs,
  getRepoDirs,
  RepoDirs,
} from "./creators/dir-creator";

config();

yargs(process.argv.slice(2)).argv;

const WHITELISTED_ORGS = ["avwebdev", "hurl-org"];

const BLACKLISTED_REPOS = ["intellij-plugin"];

const repoFill = async () => {
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
    if (!BLACKLISTED_REPOS.includes(repo.name)) {
      console.log("\n" + repo.name);
      const [
        repoFileContents,
        repoDirContents,
        repoLabelContents,
      ] = await getRepo(repo, templateDirs, cache);

      if (repoFileContents !== null) {
        await createFiles(octokit, repo, user, repoFileContents, templateFiles);
      }

      if (repoDirContents !== null) {
        await createMissingDirs(
          octokit,
          repo,
          user,
          repoDirContents,
          templateDirs
        );
      }

      if (repoLabelContents !== null) {
        await createLabels(
          octokit,
          repo,
          user,
          repoLabelContents,
          templateLabels
        );
      }

      await logRateLimit(octokit);
    }
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
    if (WHITELISTED_ORGS.includes(org.login)) {
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
  }

  await writeToCache(orgsFile, JSON.stringify(orgs));

  return repos.filter(({ fork, permissions }) => !fork && permissions?.admin);
};

const getRepo = async (
  repo: Repo,
  templateDirs: TemplateDirs,
  cache: Cache
): Promise<[RepoFiles | null, RepoDirs | null, RepoLabels | null]> => {
  const repoFileContents = await getRepoFiles(repo, cache);

  let repoDirContents: RepoDirs | null;
  if (repoFileContents) {
    repoDirContents = await getRepoDirs(
      repo,
      templateDirs,
      repoFileContents,
      cache
    );
  } else {
    repoDirContents = null;
  }

  const repoLabelContents = await getRepoLabels(repo, cache);

  return [repoFileContents, repoDirContents, repoLabelContents];
};

repoFill();
