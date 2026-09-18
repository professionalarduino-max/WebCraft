# For Fly.io / Koyeb / any Docker host: docker build -t webcraft . && docker run -p 8080:8080 webcraft
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "node server/mp-server.js --port ${PORT:-8080} --name \"WebCraft\""]
