// Externals
import { RestEndpointMethodTypes } from "@octokit/rest";

export type Repo = RestEndpointMethodTypes["repos"]["get"]["response"]["data"];

export type BaseRepoContent = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"];
