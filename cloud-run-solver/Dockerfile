# Build native HiGHS from source
FROM ubuntu:22.04 AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone and build HiGHS
RUN git clone https://github.com/ERGO-Code/HiGHS.git /highs \
    && cd /highs \
    && mkdir build \
    && cd build \
    && cmake .. -DCMAKE_BUILD_TYPE=Release \
    && make -j$(nproc) \
    && make install

# Runtime image
FROM ubuntu:22.04

# Copy HiGHS binary and libraries
COPY --from=builder /usr/local/bin/highs /usr/local/bin/highs
COPY --from=builder /usr/local/lib/libhighs* /usr/local/lib/

# Update library cache
RUN ldconfig

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify HiGHS works
RUN highs --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package-native.json ./package.json

# Install Node dependencies
RUN npm install --production

# Copy server code (v2 - simplified args)
COPY server-native.js ./server.js

# Cloud Run uses PORT env var
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
