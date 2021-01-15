// Externals
import { Octokit } from "@octokit/rest";
import axios from "axios";
import { differenceInMinutes } from "date-fns";

// Internals
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

export const logRateLimit = async (octokit: Octokit) => {
  const { data: ratelimit } = await octokit.rateLimit.get();
  console.log(
    `${ratelimit.rate.remaining} requests remaining out of ${
      ratelimit.rate.limit
    }. Resets in ${differenceInMinutes(
      new Date(ratelimit.rate.reset * 1000),
      new Date()
    )}`
  );
};
