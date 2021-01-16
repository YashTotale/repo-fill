// Externals
import { rm } from "fs/promises";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import axios, { AxiosResponse } from "axios";
import { red } from "chalk";

// Internals
import { User } from "./utils/user-utils";
import { OUTPUT_PATH } from "./constants";
import { Repo } from "./types";
import { errorEncountered } from "./utils/error-utils";

export const commitFile = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  content: string,
  path: string
): Promise<
  | RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]
  | null
> => {
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
      message: `(automated) Added ${path}`,
      path,
    });
  } catch (e) {
    await errorEncountered(e, red(`Could not create file '${path}'`));
    return null;
  }
};

export const checkOrg = (repo: Repo): string =>
  repo.owner?.type === "Organization" ? repo.owner?.login + "-" : "";

export const axiosGet = async (url: string): Promise<AxiosResponse<any>> => {
  return axios.get(url, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });
};

export const differenceInMinutes = (
  d1: Date | number,
  d2: Date | number
): string => {
  if (typeof d1 !== "number") d1 = d1.getTime();
  if (typeof d2 !== "number") d2 = d2.getTime();

  return ((d1 - d2) / 1000 / 60).toFixed(1);
};

export const logRateLimit = async (octokit: Octokit): Promise<void> => {
  const { data: ratelimit } = await octokit.rateLimit.get();
  console.log(
    `${ratelimit.rate.remaining} requests remaining out of ${
      ratelimit.rate.limit
    }. Resets in ${differenceInMinutes(
      new Date(ratelimit.rate.reset * 1000),
      new Date()
    )} minutes.`
  );
};

export const deleteOutput = async (): Promise<void> => {
  await rm(OUTPUT_PATH, { force: true, recursive: true });
};
