# Run your own Take My Word

Take My Word is open source (MIT).
You can run the whole service in your own AWS account, with your own Groq and OpenAI keys, and point the official desktop app at it with "Use your own server".
Your dictations then never touch anyone else's servers, and you pay AWS, Groq and OpenAI directly.

There are two ways to set it up:

- **With Claude Code (recommended):** a skill reads this repository, asks only what it needs and runs the setup for you.
- **By hand:** `pnpm selfhost` asks a few questions in your terminal and does the same.

Both run the same steps and can be repeated safely: a second run changes only what is different.

## What it costs

Prices checked on 2026-10-23; check the linked pages before you rely on them.

| Item                                                          | Price                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AWS: Route 53 hosted zone                                     | 0.50 USD per month ([pricing](https://aws.amazon.com/route53/pricing/))                                                 |
| AWS: Secrets Manager, two secrets per environment             | 0.40 USD per secret per month ([pricing](https://aws.amazon.com/secrets-manager/pricing/))                              |
| AWS: Lambda, API Gateway, DynamoDB, CloudFront, Cognito, logs | cents at personal use; Cognito Essentials is free up to 10,000 monthly users                                            |
| Groq `whisper-large-v3-turbo` (speech to text)                | 0.04 USD per hour of audio, at least 10 seconds per request ([pricing](https://console.groq.com/docs/speech-to-text))   |
| OpenAI `gpt-5.4-nano` (clean-up)                              | 0.20 USD per 1M input tokens, 1.25 USD per 1M output tokens ([pricing](https://developers.openai.com/api/docs/pricing)) |

So AWS costs about 1.30 USD per month for prd (0.50 for the zone, 0.80 for the two secrets, plus cents); a dev environment adds about 0.80 USD.

An example month at 15 minutes of dictation a day, in dictations of about 20 seconds:

- Groq: 7.5 hours of audio, about 0.30 USD.
- OpenAI: about 1,350 dictations of roughly 600 input and 100 output tokens each, about 0.35 USD.
- AWS: about 1.30 USD.
- Total: about 2 USD per month.

Groq's free plan covers light personal use within its rate limits, and OpenAI gives complimentary daily tokens to some organizations that share API traffic ([details](https://help.openai.com/en/articles/10306912)), so the providers can cost nothing.
The domain itself is not included.

## What you need

- An AWS account where you can create IAM roles, and an AWS CLI profile for it (`aws configure` or `aws configure sso`).
- A domain with a public Route 53 hosted zone in that account; the web can live on the zone itself or on a subdomain such as `dictation.example.com`.
  If the domain is registered elsewhere, delegate it to the zone's name servers first, or the certificates never validate.
- A [Groq API key](https://console.groq.com/keys) and an [OpenAI API key](https://platform.openai.com/api-keys) with billing set up.
- Node 24, pnpm 10 (`corepack enable`), Terraform 1.10 or newer, AWS CLI v2, git and zip.
- [Claude Code](https://claude.com/claude-code) for the recommended path.
- Windows for the desktop app; macOS and Linux come later.

## Set up with Claude Code

1. Clone this repository and install:

   ```sh
   git clone <this repository's URL> take-my-word
   cd take-my-word
   pnpm install
   ```

2. Install the skill into the project:

   ```sh
   mkdir -p .claude/skills
   cp -r self-host/skill .claude/skills/self-host
   ```

3. Put your keys in `.env` at the repository root with your own editor, never in the chat:

   ```sh
   GROQ_API_KEY=gsk_...
   OPENAI_API_KEY=sk-...
   ```

4. Start `claude` in the repository and type `/self-host`.
   It checks the tools, asks for your AWS profile, region, domain and whether you want a dev environment, writes `deployment.json` and runs `pnpm selfhost --yes`.
   The first run takes 20 to 40 minutes, most of it waiting for CloudFront and the certificates.

## Set up by hand

1. Clone and install, as in step 1 above.
2. If your profile uses SSO, sign in: `aws sso login --profile <profile>`.
3. Run `pnpm selfhost` and answer:
   - the AWS profile and region;
   - the domain, inside a Route 53 zone of the account;
   - the deployment name, the prefix of every AWS resource (`take-my-word` unless you run several);
   - whether to add a dev environment at `dev.<domain>`;
   - the GitHub repository whose releases the web offers for download (your clone's origin by default);
   - the Groq and OpenAI keys, hidden as you type.
4. Read the Terraform plan and accept it.
   The command then stores the keys in Secrets Manager, builds and uploads the code, creates the first user and waits until the site answers.

Your answers live in `deployment.json` and your keys only in Secrets Manager; both stay out of git.
Without questions, `pnpm selfhost --yes` uses `deployment.json` as it is and reads the keys from `.env`.
`pnpm selfhost --plan` shows what a run would change in AWS and stops before changing it.
The first user is `admin` unless you pass `--user <name>`.

## Sign in

1. Open `https://<domain>`, sign in as the first user with the temporary password the setup printed, and choose your own password.
2. Install the desktop app from the latest release of this repository, or from your web's download button.
3. On its sign-in step, choose "Use your own server", type your domain and sign in.

The desktop app keeps updating from the official releases; signing out offers the way back to the official server.
To add people, create users in the Cognito console (User pools, `<name>-prd`, Create user) with a temporary password.

## Update

```sh
git pull
pnpm install
pnpm selfhost
```

It applies infrastructure changes after showing the plan, and redeploys the code only when the commit changed.
To change a provider key, run `pnpm selfhost` and type the new one; empty answers keep the stored keys.

## Remove everything

```sh
pnpm selfhost remove
```

Type your domain to confirm.
It lifts the deletion protection, destroys every environment with Terraform (users and dictations included), deletes the secrets without a recovery window, deletes the state bucket the setup created, and then checks the account until nothing of the deployment is left.
It never touches the hosted zone, the domain, your local `deployment.json` and `.env`, or anything that does not carry the deployment's name.

## What it creates

Per environment, all named `<name>-<env>`: an HTTP API with its Lambdas, a DynamoDB table, a Cognito user pool, two secrets, the web on Lambda behind CloudFront, two certificates, the DNS records of the web and the API, and log groups kept 30 days.
Plus one S3 bucket for the Terraform state, `<name>-terraform-state-<account>`.
Audio is never stored; dictation text is kept 90 days.

## When something fails

- "no working credentials": run `aws sso login --profile <profile>` and run the command again.
- "no public Route 53 hosted zone": create the zone, or use a domain inside one you have.
- It waits for minutes on certificates or on "Waiting for prd to answer": check that the domain is delegated to the zone's name servers.
- Anything else: run the same command again; every step picks up where the last run stopped.
