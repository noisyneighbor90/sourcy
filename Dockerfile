FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci && \
    find node_modules -path "*/@xmtp/node-bindings" -type d -exec rm -rf {} + 2>/dev/null; \
    find node_modules -name "*.node" -delete 2>/dev/null; \
    true
COPY . .
EXPOSE 4001
CMD ["npx", "tsx", "src/web-server.ts"]
