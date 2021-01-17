// Externals
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

// Internals
import { writeToCache, Cache } from "./cache-utils";

export type User = RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"];

export const getUserData = async (
  octokit: Octokit,
  cache: Cache
): Promise<User> => {
  const userDataFile = "user-data.json";
  const cached = cache[userDataFile];

  if (typeof cached === "string") return JSON.parse(cached);

  console.log("Getting user...");
  const { data: user } = await octokit.users.getAuthenticated();

  await writeToCache(userDataFile, JSON.stringify(user));

  return user;
};
