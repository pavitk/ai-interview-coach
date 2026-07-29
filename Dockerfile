FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm install
RUN cd frontend && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd frontend && npx vite build

# Expose port
ENV PORT=8080
EXPOSE 8080

# Start server (migrate then serve)
CMD ["sh", "-c", "npm run migrate; npm run start"]
