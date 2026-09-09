FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
# Numeric UID on purpose: with runAsNonRoot the kubelet must verify the user is
# not root before the container starts, and it cannot resolve names like "node".
USER 1000
EXPOSE 3000
CMD ["node", "src/server.js"]
