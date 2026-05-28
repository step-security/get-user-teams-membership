import * as core from '@actions/core'
import { getOctokit, context } from '@actions/github'
import axios from 'axios'
import * as fs from 'fs'

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = "tspascoal/get-user-teams-membership";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info("");
  core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info("\u001b[32m✓ Free for public repositories\u001b[0m");
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info("");

  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body = { action: action || "" };

  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 },
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`,
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`,
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

export async function fetchUserTeams(api, organization, username) {
    const query = `query($cursor: String, $org: String!, $userLogins: [String!], $username: String!)  {
        user(login: $username) {
            id
        }
        organization(login: $org) {
          teams (first:100, userLogins: $userLogins, after: $cursor) {
              nodes {
                name
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
    }`

    let data
    let teams = []
    let cursor = null

    // We need to check if the user exists, because if it doesn't exist then all teams in the org
    // are returned. If user doesn't exist graphql will throw an exception
    // Paginate
    do {
        data = await api.graphql(query, {
            "cursor": cursor,
            "org": organization,
            "userLogins": [username],
            "username": username
        })

        teams = teams.concat(data.organization.teams.nodes.map((val) => {
            return val.name
        }))

        cursor = data.organization.teams.pageInfo.endCursor

        core.debug(`Got teams: ${teams.join(",")}. Has next page: ${data.organization.teams.pageInfo.hasNextPage}`)
    } while (data.organization.teams.pageInfo.hasNextPage)

    return teams
}

export function parseTeamInput(teamInput) {
    return teamInput
        .trim()
        .toLowerCase()
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
}

export function checkTeamMembership(teams, inputTeams) {
    return inputTeams.length > 0 && teams.some((teamName) => inputTeams.includes(teamName.toLowerCase()))
}

async function run() {
    try {
        await validateSubscription()
        const api = getOctokit(core.getInput("GITHUB_TOKEN", { required: true }), {})

        const organization = core.getInput("organization") || context.repo.owner
        const username = core.getInput("username", { required: true })
        const inputTeams = parseTeamInput(core.getInput("team"))

        console.log(`Getting teams for ${username} in org ${organization}.${inputTeams.length ? ` Will check if belongs to one of [${inputTeams.join(",")}]` : ''}`)

        const teams = await fetchUserTeams(api, organization, username)
        const isTeamMember = checkTeamMembership(teams, inputTeams)

        core.setOutput("teams", teams)
        core.setOutput("isTeamMember", isTeamMember)

    } catch (error) {
        core.debug(error.stack)
        core.setFailed(error.message)
    }
}

if (process.env.NODE_ENV !== 'test') {
    run()
}
