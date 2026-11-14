# Use Node.js 20 as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# System FFmpeg: ffmpeg-static is an optional dependency and its glibc binary
# doesn't run on Alpine, so the player falls back to this one.
RUN apk add --no-cache ffmpeg

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data logs backups

# Set environment variables
ENV NODE_ENV=production
# The public API is the container's only HTTP surface (no web dashboard), and it
# is what the health check below talks to.
ENV PORT=3000
ENV PUBLIC_API_ENABLED=true
ENV PUBLIC_API_HOST=0.0.0.0
ENV PUBLIC_API_PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "--no-deprecation", "index.js"]