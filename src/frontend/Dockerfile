FROM oven/bun:1

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./

# Install npm dependencies
RUN bun install

# Copy source
COPY . .

EXPOSE 5173

CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
