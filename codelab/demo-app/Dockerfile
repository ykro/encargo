FROM node:20-slim
WORKDIR /app
COPY package.json server.mjs audit.test.mjs ./
COPY public ./public
RUN node --test /app/audit.test.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
