// Externals
import { RestEndpointMethodTypes } from "@octokit/rest";

export type Repo = RestEndpointMethodTypes["repos"]["get"]["response"]["data"];
