---
updated: 2026-10-23
source: 0016_self_hosting
---

# Infra: product

## Purpose

Keeps Take My Word running for its users in two environments, dev and prd, inside its own cloud account, for a few dollars a month.
Its users are Sebastian as operator and, indirectly, everyone who dictates: they get a service that is up, private and cheap enough to stay free for invited people.
Shipping a change must take a merge, not a manual deploy.
Anyone can also run the whole service in their own AWS account, so nobody has to pay a dictation subscription.

## User flows

### Ship a change

1. Sebastian merges a pull request into `develop`.
2. Only the apps the change touched are rebuilt and deployed to dev, at `dev.<domain>`.
3. The dev deploy opens the promotion pull request from `develop` to `main`.
4. Sebastian tries the change on dev and merges the promotion pull request.
5. The same apps deploy to prd, at `<domain>`.

Errors: a failed deploy leaves the previous version serving and shows as a failed workflow run on GitHub.

### Run your own

1. A person with an AWS account, a domain in Route 53 and Groq and OpenAI keys follows `self-host/README.md`, with the Claude Code skill (recommended) or `pnpm selfhost`.
2. The setup asks for the profile, region, domain and keys, shows the plan, and after agreement creates prd (and dev if asked), deploys the code, creates the first user and prints the address and its temporary password.
3. Running it again updates the deployment and changes only what differs; `pnpm selfhost remove` deletes everything it created and nothing else.

Errors: a missing zone, expired credentials or another account's state bucket stop the setup before anything changes; any other failure is fixed by running it again.

### Change the infrastructure

1. Sebastian edits the infrastructure definitions in a task like any other change.
2. He applies them from his own machine, signed in to the project's account; automation never changes infrastructure.

### Stay within budget

1. The account has a monthly budget of 5 USD.
2. Sebastian gets an alert at 80% of actual spend and when the forecast reaches 100%.

## Rules

- dev and prd are fully separate: separate data, separate users, separate addresses; each API answers at `api.` in front of its web.
- Only the official prd web is indexed by search engines; dev and every self-hosted deployment answer noindex unless their config says otherwise.
- The repository holds no value specific to the official deployment; those live in its local config and its Actions variables.
- Automation may only replace the code of the running services; anything structural goes through Sebastian.
- The official service runs only in us-east-1 and us-east-2; a self-hosted one runs in any region.
- Recorded audio is never kept; dev alone may keep it for one day to debug.
- Dictation history disappears after 90 days.
- No third-party vendor for anything the cloud account already covers (hosting, database, identity, secrets, email).

## Out of scope

- A latency target and keeping the dictation service warm; parked until real numbers exist.
- A custom sign-in domain, which arrives with Google sign-in in phase 6.
- Bot protection or a firewall in front of the service.
- Desktop installers and mobile store builds, owned by the desktop and mobile modules.

## Future

- The evaluation harness (phase 7) adds a public metrics dashboard on the web, fed by stored evaluation runs.

## Open questions

- Whether prd keeps backups of user data beyond the 90-day history window.
