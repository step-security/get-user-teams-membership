import { getInput, setOutput, setFailed } from '@actions/core'
import { getOctokit, context } from '@actions/github'
import axios from 'axios'

async function validateSubscription() {
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`

  try {
    await axios.get(API_URL, {timeout: 3000})
  } catch (error) {
    if (error.response && error.response.status === 403) {
      core.error(
        'Subscription is not valid. Reach out to support@stepsecurity.io'
      )
      process.exit(1)
    } else {
      core.info('Timeout or API not reachable. Continuing to next step.')
    }
  }
}

run()

async function run() {

    try {

        const api = getOctokit(getInput("GITHUB_TOKEN", { required: true }), {})

        const organization = getInput("organization") || context.repo.owner
        const username = getInput("username")
        const inputTeams = getInput("team").trim().toLowerCase().split(",").map(item => item.trim())

        console.log(`Getting teams for ${username} in org ${organization}.${inputTeams.length ? ` Will check if belongs to one of [${inputTeams.join(",")}]` : ''}`)

        const query = `query($cursor: String, $org: String!, $userLogins: [String!], $username: String!)  {
            user(login: $username) {
                id
            }
            organization(login: $org) {
              teams (first:1, userLogins: $userLogins, after: $cursor) { 
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
        } while (data.organization.teams.pageInfo.hasNextPage)

        const isTeamMember = teams.some((teamName) => inputTeams.includes(teamName.toLowerCase()))

        setOutput("teams", teams)
        setOutput("isTeamMember", isTeamMember)

    } catch (error) {
        console.log(error)
        setFailed(error.message)
    }
}
