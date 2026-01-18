FROM node:20

# Install system dependencies for Puppeteer (Chrome needs these libraries)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxtst6 \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Environment variables for Puppeteer
# Install Chrome to a local cache directory
ENV PUPPETEER_CACHE_DIR=/app/.cache

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install Chrome explicitly for Puppeteer
RUN npx puppeteer browsers install chrome

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
