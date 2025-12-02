# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.3.0

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION} AS base

# Set working directory for all build stages.
WORKDIR /usr/src/app

################################################################################
# Create a stage for installing production dependencies.
FROM base AS deps

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage bind mounts to package.json and package-lock.json to avoid having to copy them
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

################################################################################
# Create a stage for building the application.
FROM deps AS build

# Download additional development dependencies before building, as some projects require
# "devDependencies" to be installed to build. If you don't need this, remove this step.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci

# Copy the rest of the source files into the image.
COPY . .
# Run the build script.
RUN npm run build

################################################################################
# Create a new stage to serve the application with minimal runtime dependencies.
FROM node:${NODE_VERSION}-slim AS final

# Use production node environment by default.
ENV NODE_ENV=production

# Set working directory.
WORKDIR /usr/src/app

# Copy package.json so that package manager commands can be used.
COPY package.json .

# Copy the production dependencies from the deps stage.
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy the built application from the build stage.
COPY --from=build /usr/src/app/dist ./dist

# Expose the port that the application listens on.
EXPOSE 4173

# Install a lightweight HTTP server for serving static files (like 'serve').
RUN npm install -g serve

# Run the application using a static file server.
CMD ["serve", "-s", "dist"]

