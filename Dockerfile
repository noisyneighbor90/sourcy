FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4001
CMD ["npx", "tsx", "src/buyer-server.ts"]
