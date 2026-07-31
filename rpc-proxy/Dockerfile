# Tor + Node forwarder in one small image.
FROM node:20-slim

# Tor for the SOCKS5 proxy that reaches the .onion RPC.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tor ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev

COPY server.js start.sh ./
RUN chmod +x start.sh

ENV PORT=8080 \
    TOR_SOCKS=socks5h://127.0.0.1:9050
EXPOSE 8080

CMD ["./start.sh"]
