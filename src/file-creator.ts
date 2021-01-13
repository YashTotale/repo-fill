// Externals
import { config } from "dotenv-safe";
import yargs from "yargs/yargs";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import axios from "axios";

// Internals
import { getCacheContents, writeToCache } from "./cache-utils";

config();

yargs(process.argv.slice(2)).argv;

const fileCreator = async () => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const cache = await getCacheContents();

  const user = await getUserData(octokit, cache);

  const repos = await getRepos(user, cache);

  repos.forEach((repo) => {
    console.log(repo.name);
  });
};

type UserData = RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"];

const getUserData = async (
  octokit: Octokit,
  cache: Record<string, string>
): Promise<UserData> => {
  const userDataFile = "user-data.json";
  const cached = cache[userDataFile];

  if (typeof cached === "string") return JSON.parse(cached);

  console.log("Getting user...");
  const { data: user } = await octokit.users.getAuthenticated();

  writeToCache(userDataFile, JSON.stringify(user));

  return user;
};

type Repo = RestEndpointMethodTypes["repos"]["get"]["response"]["data"];

const getRepos = async (
  user: UserData,
  cache: Record<string, string>
): Promise<Repo[]> => {
  const repoFile = "repos.json";
  const cached = cache[repoFile];

  if (typeof cached === "string") return JSON.parse(cached);

  console.log("Getting repos...");
  const { data: repos } = await axios.get(user.repos_url);

  writeToCache(repoFile, JSON.stringify(repos));

  return repos;
};

fileCreator();
