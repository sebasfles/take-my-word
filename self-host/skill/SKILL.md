---
name: self-host
description: Set up, update or remove the person's own Take My Word deployment in their AWS account, from this repository, with pnpm selfhost. Use when they ask to run, deploy, self-host, update or remove their own Take My Word.
---

# self-host

You walk one person through running Take My Word in their own AWS account.
`self-host/README.md` is the source of truth; read it first and follow it.
You run the same steps as the manual path, through `pnpm selfhost --yes`, and you ask only what the repository and the account cannot tell you.

## Never

- Never ask for, read, print or repeat the Groq or OpenAI keys, and never put a secret in a command line.
  The person writes them into `.env` with their own editor; you only check that the two names are there.
- Never print `.env`, commit `deployment.json` or `.env`, or change code in this repository.
- Never run `pnpm selfhost remove` unless the person asked for removal in this conversation and typed their domain to confirm it.
- Never run `pnpm tf` or `terraform` yourself; `pnpm selfhost` runs them.
- Never touch a `deployment.json` that has a `github` section: that deployment is not managed with this skill.

## Set up

1. Check the tools and report anything missing with how to install it: `node -v` (24), `pnpm -v` (10), `terraform version` (1.10 or newer), `aws --version` (v2), `git --version`, `zip -v`.
   Run `pnpm install` if `node_modules` is missing.
2. Ask, in one message, with a default for each:
   - the AWS CLI profile (list them with `aws configure list-profiles`);
   - the region (default `us-east-1`);
   - the domain for the web (for example `dictation.example.com`);
   - whether they also want a dev environment (default no);
   - the username of the first user (default `admin`).
3. Check the profile with `aws sts get-caller-identity --profile <profile>`.
   If the SSO session expired, ask them to run `! aws sso login --profile <profile>` and wait.
4. Check the domain: `aws route53 list-hosted-zones-by-name --profile <profile>` must show a public zone that is the domain or a parent of it.
   If none, explain that they need one (see "What you need" in the README) and stop.
5. Ask them to add `GROQ_API_KEY=...` and `OPENAI_API_KEY=...` to `.env` at the repository root with their editor.
   Check without reading the values: `grep -oE '^(GROQ_API_KEY|OPENAI_API_KEY)=.' .env | cut -d= -f1`.
   On a re-run, keys already stored in AWS are kept, so this step can be skipped.
6. Write `deployment.json` (keep an existing one's values unless they changed an answer):

   ```json
   {
     "$schema": "./deployment.schema.json",
     "name": "take-my-word",
     "aws": { "profile": "<profile>", "accountId": "<from sts>", "region": "<region>" },
     "domain": "<domain>",
     "environments": ["prd"],
     "releases": "<owner/name of git remote get-url origin>"
   }
   ```

   Use `["dev", "prd"]` when they want dev.
   `deployment.schema.json` documents every key.

7. Run `pnpm selfhost --plan`; it creates only the empty state bucket it needs to plan, and changes nothing else.
   Summarize the plan for them: how many resources it adds, changes and destroys, and that every name starts with the deployment name.
   Go on only when they agree.
8. Tell them the first run takes 20 to 40 minutes, then run `pnpm selfhost --yes --user <username>` with a long timeout, in the background if your tools allow, and follow its output.
   If it stops, read the reason it prints, fix what the README's "When something fails" says, and run it again; it resumes.
9. When it prints "Ready", give them the web URL, the username and the temporary password, and tell them:
   - the first sign-in on the web asks for a new password;
   - in the desktop app they choose "Use your own server" on the sign-in step and type the domain;
   - they can delete the two keys from `.env`: they are stored in AWS, and a re-run keeps them.

## Update

`git pull`, `pnpm install`, then `pnpm selfhost --plan`.
Summarize the plan; if it destroys or replaces anything, say what and why it matters before going on.
With their agreement, run `pnpm selfhost --yes`; it redeploys the code only when the commit, `releases` or `indexed` changed.

## Remove

Only on their request.
Explain what goes (every environment, its users and dictations, the secrets, the state bucket) and what stays (the hosted zone, the domain, local files).
Ask them to type the domain in the chat to confirm, then run `pnpm selfhost remove --yes` with a long timeout.
It ends by checking the account; relay anything it reports as left.
