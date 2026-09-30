# Built by Cloud Build from stores/kilometro after `npm run sync` (infra/30-deploy-stores.sh),
# so src/shared and the images are already in the build context.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 STORE_KEY=kilometro DB_PATH=/tmp/kilometro.db
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
