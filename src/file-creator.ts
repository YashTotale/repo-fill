import yargs from "yargs/yargs";
import { Octokit } from "@octokit/rest";

yargs(process.argv.slice(2)).argv;

const fileCreator = async () => {
  const octokit = new Octokit();
};

fileCreator();
