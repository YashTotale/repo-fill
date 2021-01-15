// Externals
import { Octokit } from "@octokit/rest";
import axios from "axios";
import { rm } from "fs/promises";

// Internals
import { OUTPUT_PATH } from "./constants";
import { Repo } from "./types";

export const checkOrg = (repo: Repo) =>
  repo.owner?.type === "Organization" ? repo.owner?.login + "-" : "";

export const axiosGet = (url: string) => {
  return axios.get(url, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });
};

export const differenceInMinutes = (d1: Date | number, d2: Date | number) => {
  if (typeof d1 !== "number") d1 = d1.getTime();
  if (typeof d2 !== "number") d2 = d2.getTime();

  return ((d1 - d2) / 1000 / 60).toFixed(1);
};

export const logRateLimit = async (octokit: Octokit) => {
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

export const deleteOutput = async () => {
  await rm(OUTPUT_PATH, { force: true, recursive: true });
};
