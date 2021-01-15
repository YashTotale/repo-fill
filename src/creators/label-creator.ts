// Externals
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

// Internals
import { writeToCache, Cache } from "../utils/cache-utils";
import { User } from "../utils/user-utils";
import { checkOrg, axiosGet } from "../helpers";
import { Repo } from "../types";

export type RepoLabels = RestEndpointMethodTypes["issues"]["getLabel"]["response"]["data"][];

export const REPO_LABELS = (repo: Repo) =>
  `repo-labels/${checkOrg(repo)}${repo.name}.json`;

interface Label {
  description: string;
  color: string;
}

export const REQUIRED_LABELS: Record<string, Label> = {
  stale: {
    description: "No activity",
    color: "ebdcb5",
  },
  "feature-request": {
    description: "New feature",
    color: "340EDA",
  },
};

export const getRepoLabels = async (
  repo: Repo,
  cache: Cache
): Promise<RepoLabels> => {
  const cachedLabelsFile = cache[REPO_LABELS(repo)];

  if (typeof cachedLabelsFile === "string") return JSON.parse(cachedLabelsFile);
  else {
    console.log(`Getting repo '${repo.name}' labels...`);
    const { data: repoLabels } = await axiosGet(
      repo.labels_url.replace("{/name}", "")
    );
    writeToCache(REPO_LABELS(repo), JSON.stringify(repoLabels));
    return repoLabels;
  }
};

export const createLabels = async (
  octokit: Octokit,
  repo: Repo,
  user: User,
  repoLabelContents: RepoLabels
) => {
  for (const label in REQUIRED_LABELS) {
    const found = repoLabelContents.find((l) => l.name === label);
    const properties = REQUIRED_LABELS[label];

    if (!found) {
      console.log(`Creating label '${label}'...`);
      const { data } = await octokit.issues.createLabel({
        owner: repo.owner?.login ?? user.login,
        repo: repo.name,
        name: label,
        color: properties.color,
        description: properties.description,
      });

      repoLabelContents.push(data);

      await writeToCache(REPO_LABELS(repo), JSON.stringify(repoLabelContents));
    }
  }
};
