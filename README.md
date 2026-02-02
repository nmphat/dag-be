# DAG - Taxonomy Explorer BE

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Prerequisites

- Node.js v16 or newer (LTS recommended).
- `pnpm` package manager (install with `npm i -g pnpm`).
- Docker and Docker Compose (for running MariaDB, Elasticsearch, Redis).
- A Linux environment or WSL2 on Windows (recommended). Many project scripts expect a Unix-like shell (`bash`) and Linux-style paths.
- Bash / POSIX utilities (available in WSL, Git Bash, or a native Linux shell).

Recommendation: run the project in a Linux environment or inside WSL2 on Windows. Running natively on Windows may require manual adjustments to scripts, path formats, and file permissions.

## Quick Start

### 1. Environment Setup

Prepare the environment variables:

```bash
cp .env.example .env
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Sample Data Setup

Download and extract sample Wikidata into the following directory:
`/home/pc/0131/be/docs/sample-data/from-wikidata`

Note: the path above is a Linux-style path. If you're on Windows, run these steps inside WSL2 (recommended) and place the data under the WSL filesystem (for example `/home/<your-user>/...`). If you prefer running natively on Windows, adjust paths accordingly and ensure your shell provides POSIX tools (e.g., Git Bash), though some scripts may still fail.

**Expected Structure:**

```text
docs/sample-data/from-wikidata/
├── category_folder_q123/
│   ├── concepts.json
│   └── edges.json
├── category_folder_q456/
│   ├── concepts.json
│   └── edges.json
└── imported.txt
```

### 4. Infrastructure & Database Setup

```bash
# Setup Docker environment (MariaDB, Elasticsearch, Redis)
chmod +x docker/setup-replication.sh
pnpm docker:setup

# or manual run with bash `bash -x docker/setup-replication.sh`

# Run Prisma migrations
pnpm prisma:migrate

# Import sample data into the database
pnpm db:import:sample
pnpm db:import:wiki # ~ 30 min

# Reindex Elasticsearch
pnpm es:reindex
```

### 5. Start the Application

```bash
pnpm start
```

## Advanced Commands

```bash
# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
pnpm install -g @nestjs/mau
mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
