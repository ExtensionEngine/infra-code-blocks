FROM node:22.14-bookworm-slim@sha256:bac8ff0b5302b06924a5e288fb4ceecef9c8bb0bb92515985d2efdc3a2447052 AS base
RUN apt update && apt install -y --no-install-recommends dumb-init
ENTRYPOINT ["dumb-init", "--"]

FROM node:22.14-bookworm@sha256:0d6c855cacc3e167d82d74e4e1cbb62082a12bba57cb5e99325a4c6680fae79a AS install
WORKDIR /usr/src/app
COPY package*.json .
RUN npm ci

FROM base AS configure
WORKDIR /usr/src/app
COPY --chown=node:node --from=install /usr/src/app/node_modules ./node_modules
COPY --chown=node:node ./package.json ./tsconfig.json ./
COPY --chown=node:node ./src ./src
RUN npm run build

FROM configure AS run
USER node
CMD ["npm", "start"]
