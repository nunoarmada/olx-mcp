# Container image for running olx-mcp as a remote MCP server (Streamable HTTP).
# olx-mcp itself only speaks stdio; supergateway bridges it to HTTP and spawns
# one olx-mcp process (and one headless Chromium) per MCP session.
# CI passes PLAYWRIGHT_VERSION from package-lock.json; the default is for local builds.
ARG PLAYWRIGHT_VERSION=1.55.0

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skip husky and the postinstall browser download (the base image ships Chromium)
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
ARG SUPERGATEWAY_VERSION=3.4.3
ENV NODE_ENV=production \
    HOME=/tmp
RUN npm install -g --ignore-scripts supergateway@${SUPERGATEWAY_VERSION} \
    && npm cache clean --force
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER pwuser
EXPOSE 8000
# Sessions idle for 10 minutes are closed and their olx-mcp/Chromium process is killed.
CMD ["supergateway", \
     "--stdio", "exec node /app/dist/index.js", \
     "--outputTransport", "streamableHttp", \
     "--stateful", \
     "--sessionTimeout", "600000", \
     "--port", "8000", \
     "--healthEndpoint", "/healthz"]
